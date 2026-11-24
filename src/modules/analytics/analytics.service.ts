import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { differenceInCalendarMonths, endOfMonth, subMonths } from 'date-fns';
import { format } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { Model, Types } from 'mongoose';
import {
  endOfIstDay,
  indianFy,
  isoDate,
  IST,
  monthRange,
  quarterRange,
  startOfIstDay,
} from '../../common/dates';
import { RedisService } from '../redis/redis.service';
import { Transaction } from '../transactions/transaction.schema';
import { Account } from '../accounts/account.schema';
import { Investment } from '../investments/investment.schema';
import { Category } from '../categories/category.schema';
import { buildTxFilter } from './tx-filter';

type TxRow = {
  type: string;
  amountPaise: number;
  date: Date;
  narration?: string;
  merchant?: string;
  isCredit?: boolean;
  excludedFromReports?: boolean;
  categoryId?: Types.ObjectId;
  subcategoryId?: Types.ObjectId;
};

type AnalyticsFilters = {
  accountId?: string;
  categoryId?: string;
  subcategoryId?: string;
  type?: string;
};

type Bucket = {
  income: number;
  otherCredit: number;
  expense: number;
  refundReversal: number;
  interest: number;
  emi: number;
  partPayment: number;
  investment: number;
  transfer: number;
  actualSpent: number;
  allSpent: number;
  credit: number;
  debit: number;
};

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Transaction.name) private txs: Model<Transaction>,
    @InjectModel(Account.name) private accounts: Model<Account>,
    @InjectModel(Investment.name) private investments: Model<Investment>,
    @InjectModel(Category.name) private categories: Model<Category>,
    private cache: RedisService,
  ) {}

  async summary(
    userId: string,
    range: string,
    from?: string,
    to?: string,
    filters: AnalyticsFilters = {},
  ) {
    const uid = new Types.ObjectId(userId);
    let { start, end, label } = await this.resolveRange(uid, range, from, to);
    const prev = range === 'all' ? null : previousWindow(start, end);
    const endIso = isoDate(end);
    const chartStart = monthsSpanned(isoDate(start), endIso) >= 3 ? start : startOfMonthIst(subMonths(toZonedTime(end, IST), 11));
    const yearStart = startOfIstDay(`${toZonedTime(end, IST).getFullYear() - 3}-01-01`);
    const queryStart = earliest(start, prev?.start, chartStart, yearStart);

    const cats = await this.categories
      .find({ $or: [{ isSystem: true }, { userId: uid }] })
      .lean()
      .exec();
    const catById = new Map(cats.map((c) => [String(c._id), c]));
    const txFilter = buildTxFilter(uid, queryStart, end, filters, cats);
    const filterKey = [
      filters.accountId || '',
      filters.categoryId || '',
      filters.subcategoryId || '',
      filters.type || '',
    ].join(':');
    const key = `analytics:v5:${userId}:${isoDate(start)}:${endIso}:${range}:${filterKey}`;
    const cached = await this.cache.getJson<unknown>(key);
    if (cached) return cached;

    const rows = (await this.txs.find(txFilter).lean().exec()) as TxRow[];

    const inRange: TxRow[] = [];
    const previous: TxRow[] = [];
    const byMonth = new Map<string, Bucket>();
    const byYear = new Map<string, Bucket>();
    const byDay = new Map<string, { income: number; expense: number; actualSpent: number }>();
    const byWeekday = new Map<string, { actualSpent: number; count: number }>();
    const byParent = new Map<string, { amountPaise: number; children: Map<string, number> }>();
    const byMerchant = new Map<string, number>();
    const byType = new Map<string, number>();

    for (const t of rows) {
      const day = isoDate(t.date);
      const inSelected = t.date >= start && t.date <= end;
      if (inSelected) inRange.push(t);
      if (prev && t.date >= prev.start && t.date <= prev.end) previous.push(t);

      const month = day.slice(0, 7);
      const year = day.slice(0, 4);
      const monthBucket = byMonth.get(month) ?? emptyBucket();
      addToBucket(monthBucket, t);
      byMonth.set(month, monthBucket);
      const yearBucket = byYear.get(year) ?? emptyBucket();
      addToBucket(yearBucket, t);
      byYear.set(year, yearBucket);

      if (!inSelected) continue;

      const dayBucket = byDay.get(day) ?? { income: 0, expense: 0, actualSpent: 0 };
      const type = normalizeType(t.type);
      if (!(t.excludedFromReports || type === 'transfer')) {
        if (type === 'income') dayBucket.income += t.amountPaise;
        if (type === 'expense') {
          dayBucket.expense += t.amountPaise;
          dayBucket.actualSpent += t.amountPaise;
        }
        if (type === 'refund' || type === 'reversal') dayBucket.actualSpent -= t.amountPaise;
        byType.set(type, (byType.get(type) ?? 0) + t.amountPaise);
      }
      byDay.set(day, dayBucket);

      const wd = format(toZonedTime(t.date, IST), 'EEE');
      const wdBucket = byWeekday.get(wd) ?? { actualSpent: 0, count: 0 };
      if (!(t.excludedFromReports || type === 'transfer')) {
        if (type === 'expense') {
          wdBucket.actualSpent += t.amountPaise;
          wdBucket.count += 1;
        } else if (type === 'refund' || type === 'reversal') {
          wdBucket.actualSpent -= t.amountPaise;
        }
      }
      byWeekday.set(wd, wdBucket);

      if (t.excludedFromReports || type === 'transfer' || type !== 'expense') continue;
      const resolved = resolveCat(t.categoryId, t.subcategoryId, catById);
      const parentKey = resolved.parentId || 'uncategorized';
      const node = byParent.get(parentKey) ?? { amountPaise: 0, children: new Map() };
      node.amountPaise += t.amountPaise;
      if (resolved.subId) {
        node.children.set(resolved.subId, (node.children.get(resolved.subId) ?? 0) + t.amountPaise);
      }
      byParent.set(parentKey, node);
      if (t.merchant) {
        byMerchant.set(t.merchant, (byMerchant.get(t.merchant) ?? 0) + t.amountPaise);
      }
    }

    const totals = fold(inRange);
    const previousTotals = prev ? fold(previous) : null;
    const activeMonths = new Set(inRange.map((t) => isoDate(t.date).slice(0, 7))).size;
    const calendarMonths = monthsSpanned(isoDate(start), endIso);
    const monthsCount = Math.max(1, activeMonths || calendarMonths);
    const chartFromIso = isoDate(chartStart);
    const yearFrom = String(toZonedTime(yearStart, IST).getFullYear());

    const accounts = await this.accounts.find({ userId: uid, isActive: { $ne: false } });
    const cash = accounts
      .filter((a) => a.type !== 'investment' && a.type !== 'loan')
      .reduce((s, a) => s + a.currentBalancePaise, 0);
    const inv = await this.investments.find({ userId: uid });
    const investValue = inv.reduce((s, i) => s + i.currentValuePaise, 0);

    const byCategory = [...byParent.entries()]
      .map(([categoryId, node]) => {
        const cat = catById.get(categoryId);
        return {
          categoryId,
          name: cat?.name ?? 'Uncategorized',
          color: cat?.color ?? '#52525b',
          amountPaise: node.amountPaise,
          share: totals.actualSpent ? node.amountPaise / totals.actualSpent : 0,
          children: [...node.children.entries()].map(([id, amountPaise]) => ({
            categoryId: id,
            name: catById.get(id)?.name ?? 'Other',
            amountPaise,
          })),
        };
      })
      .sort((a, b) => b.amountPaise - a.amountPaise);

    const topExpenses = inRange
      .filter((t) => normalizeType(t.type) === 'expense' && !t.excludedFromReports)
      .sort((a, b) => b.amountPaise - a.amountPaise)
      .slice(0, 8)
      .map((t) => ({
        date: isoDate(t.date),
        merchant: t.merchant || t.narration?.slice(0, 48) || 'Expense',
        amountPaise: t.amountPaise,
      }));

    const weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = {
      range: label,
      from: isoDate(start),
      to: endIso,
      monthsCount,
      incomePaise: totals.income,
      otherCreditPaise: totals.otherCredit,
      expensePaise: totals.expense,
      refundReversalPaise: totals.refundReversal,
      interestPaise: totals.interest,
      emiPaise: totals.emi,
      partPaymentPaise: totals.partPayment,
      investmentPaise: totals.investment,
      transferPaise: totals.transfer,
      actualSpentPaise: totals.actualSpent,
      allSpentPaise: totals.allSpent,
      creditPaise: totals.credit,
      debitPaise: totals.debit,
      netPaise: totals.income - totals.actualSpent,
      leftoverAfterEmiPaise: totals.income - totals.allSpent,
      savingsRate: totals.income ? (totals.income - totals.actualSpent) / totals.income : 0,
      cashPaise: cash,
      netWorthPaise: cash + investValue,
      txCount: inRange.length,
      averages: {
        months: monthsCount,
        actualSpentPaise: Math.round(totals.actualSpent / monthsCount),
        allSpentPaise: Math.round(totals.allSpent / monthsCount),
        emiPaise: Math.round(totals.emi / monthsCount),
        incomePaise: Math.round(totals.income / monthsCount),
        investmentPaise: Math.round(totals.investment / monthsCount),
        partPaymentPaise: Math.round(totals.partPayment / monthsCount),
      },
      previous: previousTotals
        ? {
            from: isoDate(prev!.start),
            to: isoDate(prev!.end),
            incomePaise: previousTotals.income,
            actualSpentPaise: previousTotals.actualSpent,
            allSpentPaise: previousTotals.allSpent,
            emiPaise: previousTotals.emi,
            investmentPaise: previousTotals.investment,
            partPaymentPaise: previousTotals.partPayment,
            creditPaise: previousTotals.credit,
            debitPaise: previousTotals.debit,
            netPaise: previousTotals.income - previousTotals.actualSpent,
          }
        : null,
      byCategory,
      byMonth: fillMonths(chartFromIso, endIso, byMonth).map(([month, v]) => ({
        month,
        income: v.income,
        expense: v.expense,
        actualSpent: v.actualSpent,
        allSpent: v.allSpent,
        emi: v.emi,
        investment: v.investment,
        partPayment: v.partPayment,
        interest: v.interest,
        transfer: v.transfer,
        credit: v.credit,
        debit: v.debit,
      })),
      byYear: [...byYear.entries()]
        .filter(([year]) => year >= yearFrom)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([year, v]) => ({
          year,
          income: v.income,
          expense: v.expense,
          actualSpent: v.actualSpent,
          allSpent: v.allSpent,
          emi: v.emi,
          investment: v.investment,
          partPayment: v.partPayment,
          interest: v.interest,
          transfer: v.transfer,
          credit: v.credit,
          debit: v.debit,
        })),
      byDay: [...byDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, v]) => ({ day, ...v })),
      byWeekday: weekdayOrder.map((day) => ({
        day,
        actualSpentPaise: byWeekday.get(day)?.actualSpent ?? 0,
        count: byWeekday.get(day)?.count ?? 0,
      })),
      byType: [...byType.entries()]
        .map(([type, amountPaise]) => ({ type, amountPaise }))
        .sort((a, b) => b.amountPaise - a.amountPaise),
      merchants: [...byMerchant.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([merchant, amountPaise]) => ({
          merchant,
          amountPaise,
          share: totals.actualSpent ? amountPaise / totals.actualSpent : 0,
        })),
      topExpenses,
    };
    await this.cache.setJson(key, data, 120);
    return data;
  }

  private async resolveRange(
    uid: Types.ObjectId,
    range: string,
    from?: string,
    to?: string,
  ) {
    if (from && to) {
      return { start: startOfIstDay(from), end: endOfIstDay(to), label: range || 'custom' };
    }
    const now = new Date();
    if (range === 'all') {
      const first = await this.txs
        .findOne({ userId: uid, isDeleted: false })
        .sort({ date: 1 })
        .select('date')
        .lean()
        .exec();
      const start = first?.date ? startOfIstDay(isoDate(first.date as Date)) : startOfIstDay(isoDate(now));
      return { start, end: endOfIstDay(isoDate(now)), label: 'all' };
    }
    if (range === 'year') {
      const y = toZonedTime(now, IST).getFullYear();
      return { start: startOfIstDay(`${y}-01-01`), end: endOfIstDay(`${y}-12-31`), label: 'year' };
    }
    if (range === 'quarter') {
      const q = quarterRange(now);
      return { start: q.from, end: q.to, label: 'quarter' };
    }
    if (range === 'fy') {
      const fy = indianFy(now);
      return { start: fy.from, end: fy.to, label: fy.label };
    }
    if (range === 'last_month') {
      const prev = monthRange(subMonths(toZonedTime(now, IST), 1));
      return { start: prev.from, end: prev.to, label: 'last_month' };
    }
    if (range === 'last_6m' || range === 'last_12m') {
      const n = range === 'last_6m' ? 6 : 12;
      const endZ = toZonedTime(now, IST);
      const startZ = subMonths(endZ, n - 1);
      startZ.setDate(1);
      const start = startOfMonthIst(startZ);
      const m = monthRange(now);
      return { start, end: m.to, label: range };
    }
    const m = monthRange(now);
    return { start: m.from, end: m.to, label: 'month' };
  }
}

function emptyBucket(): Bucket {
  return {
    income: 0,
    otherCredit: 0,
    expense: 0,
    refundReversal: 0,
    interest: 0,
    emi: 0,
    partPayment: 0,
    investment: 0,
    transfer: 0,
    actualSpent: 0,
    allSpent: 0,
    credit: 0,
    debit: 0,
  };
}

function normalizeType(type: string) {
  return type === 'fee' ? 'expense' : type;
}

function isCreditSide(t: { type: string; narration?: string; isCredit?: boolean }) {
  if (t.isCredit === true) return true;
  if (t.isCredit === false) return false;
  const type = normalizeType(t.type);
  if (['income', 'refund', 'reversal', 'interest'].includes(type)) return true;
  const head = (t.narration ?? '').slice(0, 120);
  if (/UPI\/CR/i.test(head) || /^(DEP TFR|CREDIT)\b/i.test(head)) return true;
  if (/UPI\/DR/i.test(head) || /^(WDL TFR|DEBIT)\b/i.test(head) || /^POS-/i.test(head)) return false;
  return false;
}

function addToBucket(b: Bucket, t: TxRow) {
  const type = normalizeType(t.type);
  const amt = t.amountPaise ?? 0;
  if (isCreditSide(t)) b.credit += amt;
  else b.debit += amt;
  if (t.excludedFromReports) {
    finish(b);
    return;
  }
  if (type === 'transfer') {
    b.transfer += amt;
    finish(b);
    return;
  }
  if (type === 'income') b.income += amt;
  else if (type === 'refund' || type === 'reversal') b.refundReversal += amt;
  else if (type === 'interest') b.interest += amt;
  else if (type === 'emi') b.emi += amt;
  else if (type === 'part_payment') b.partPayment += amt;
  else if (type === 'investment') b.investment += amt;
  else if (type === 'expense') b.expense += amt;
  finish(b);
}

function finish(b: Bucket) {
  b.otherCredit = b.refundReversal + b.interest;
  b.actualSpent = b.expense - b.refundReversal;
  b.allSpent = b.actualSpent + b.emi;
}

function fold(rows: TxRow[]) {
  const b = emptyBucket();
  for (const t of rows) addToBucket(b, t);
  return b;
}

function monthsSpanned(fromIso: string, toIso: string) {
  const y1 = Number(fromIso.slice(0, 4));
  const m1 = Number(fromIso.slice(5, 7));
  const y2 = Number(toIso.slice(0, 4));
  const m2 = Number(toIso.slice(5, 7));
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}

function fillMonths(fromIso: string, toIso: string, map: Map<string, Bucket>) {
  const out: Array<[string, Bucket]> = [];
  let y = Number(fromIso.slice(0, 4));
  let m = Number(fromIso.slice(5, 7));
  const ey = Number(toIso.slice(0, 4));
  const em = Number(toIso.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push([key, map.get(key) ?? emptyBucket()]);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function startOfMonthIst(d: Date) {
  const z = toZonedTime(d, IST);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, '0');
  return fromZonedTime(`${y}-${m}-01 00:00:00`, IST);
}

function previousWindow(start: Date, end: Date) {
  const s = toZonedTime(start, IST);
  const e = toZonedTime(end, IST);
  const monthAligned = s.getDate() === 1 && e.getDate() === endOfMonth(e).getDate();
  if (monthAligned) {
    const n = differenceInCalendarMonths(e, s) + 1;
    const prevStartZ = subMonths(s, n);
    const prevEndZ = endOfMonth(subMonths(s, 1));
    return {
      start: fromZonedTime(`${format(prevStartZ, 'yyyy-MM-dd')} 00:00:00`, IST),
      end: fromZonedTime(`${format(prevEndZ, 'yyyy-MM-dd')} 23:59:59.999`, IST),
    };
  }
  const ms = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  return { start: new Date(prevEnd.getTime() - ms), end: prevEnd };
}

function earliest(...dates: Array<Date | undefined>) {
  return dates.filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0];
}

function resolveCat(
  categoryId: Types.ObjectId | undefined,
  subcategoryId: Types.ObjectId | undefined,
  catById: Map<string, Category & { _id: Types.ObjectId; parentId?: Types.ObjectId }>,
) {
  const sub = subcategoryId ? catById.get(String(subcategoryId)) : undefined;
  const cat = categoryId ? catById.get(String(categoryId)) : undefined;
  if (sub?.parentId) {
    return { parentId: String(sub.parentId), subId: String(sub._id) };
  }
  if (cat?.parentId) {
    return { parentId: String(cat.parentId), subId: String(cat._id) };
  }
  return { parentId: cat ? String(cat._id) : '', subId: sub ? String(sub._id) : '' };
}
