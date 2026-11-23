import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addWeeks } from 'date-fns';
import { Model, Types } from 'mongoose';
import { isoDate, istNoon } from '../../common/dates';
import { ownedFilter } from '../../common/object-id';
import { TransactionsService } from '../transactions/transactions.service';
import { RecurringRule, RecurringRuleDocument } from './recurring.schema';

export type RecurringInput = {
  accountId?: string | Types.ObjectId;
  name?: string;
  amountPaise?: number;
  type?: string;
  categoryId?: string | Types.ObjectId;
  subcategoryId?: string | Types.ObjectId;
  frequency?: string;
  nextRun?: Date;
  endDate?: Date;
  dayOfMonth?: number;
  autoCreate?: boolean;
  isActive?: boolean;
  merchant?: string;
  note?: string;
};

@Injectable()
export class RecurringService implements OnModuleInit {
  private readonly log = new Logger(RecurringService.name);

  constructor(
    @InjectModel(RecurringRule.name) private model: Model<RecurringRuleDocument>,
    private txs: TransactionsService,
  ) {}

  onModuleInit() {
    setInterval(() => {
      this.runDue().catch((err) => this.log.warn(String(err)));
    }, 60 * 60 * 1000);
  }

  list(userId: string) {
    return this.model.find({ userId: new Types.ObjectId(userId) }).sort({ nextRun: 1, name: 1 }).lean().exec();
  }

  upcoming(userId: string) {
    const until = new Date();
    until.setDate(until.getDate() + 30);
    return this.model
      .find({
        userId: new Types.ObjectId(userId),
        isActive: true,
        nextRun: { $lte: until },
      })
      .sort({ nextRun: 1 })
      .limit(12)
      .lean()
      .exec();
  }

  async create(userId: string, data: RecurringInput) {
    if (!data.accountId || !data.name || data.amountPaise == null || !data.nextRun) {
      throw new NotFoundException('Recurring transaction is incomplete');
    }
    const doc = await this.model.create({
      userId: new Types.ObjectId(userId),
      accountId: new Types.ObjectId(String(data.accountId)),
      name: data.name,
      amountPaise: data.amountPaise,
      type: data.type ?? 'expense',
      categoryId: data.categoryId ? new Types.ObjectId(String(data.categoryId)) : undefined,
      subcategoryId: data.subcategoryId ? new Types.ObjectId(String(data.subcategoryId)) : undefined,
      frequency: data.frequency ?? 'monthly',
      nextRun: data.nextRun,
      endDate: data.endDate,
      dayOfMonth: data.dayOfMonth ?? Number(isoDate(data.nextRun).slice(8, 10)),
      autoCreate: data.autoCreate ?? true,
      isActive: true,
      merchant: data.merchant ?? data.name,
      note: data.note,
    });
    await this.catchUp(doc);
    return doc;
  }

  async update(userId: string, id: string, data: RecurringInput) {
    const doc = await this.model.findOne(ownedFilter(userId, id, 'Recurring rule'));
    if (!doc) throw new NotFoundException('Recurring transaction not found');
    if (data.name != null) doc.name = data.name;
    if (data.amountPaise != null) doc.amountPaise = data.amountPaise;
    if (data.type) doc.type = data.type;
    if (data.frequency) doc.frequency = data.frequency;
    if (data.accountId) doc.accountId = new Types.ObjectId(String(data.accountId));
    if (data.nextRun) doc.nextRun = data.nextRun;
    if (data.dayOfMonth != null) doc.dayOfMonth = data.dayOfMonth;
    if (data.endDate !== undefined) doc.endDate = data.endDate;
    if (data.categoryId !== undefined) {
      doc.categoryId = data.categoryId ? new Types.ObjectId(String(data.categoryId)) : undefined;
    }
    if (data.subcategoryId !== undefined) {
      doc.subcategoryId = data.subcategoryId
        ? new Types.ObjectId(String(data.subcategoryId))
        : undefined;
    }
    if (data.note !== undefined) doc.note = data.note;
    if (data.merchant !== undefined) doc.merchant = data.merchant;
    if (data.isActive != null) doc.isActive = data.isActive;
    if (data.autoCreate != null) doc.autoCreate = data.autoCreate;
    await doc.save();
    await this.catchUp(doc);
    return doc;
  }

  async remove(userId: string, id: string) {
    const doc = await this.model.findOne(ownedFilter(userId, id, 'Recurring rule'));
    if (!doc) throw new NotFoundException('Recurring transaction not found');
    await doc.deleteOne();
    return { id: String(doc._id), deleted: true };
  }

  async runDue() {
    const due = await this.model.find({ isActive: true, nextRun: { $lte: new Date() } });
    for (const rule of due) {
      await this.catchUp(rule);
    }
    return { ran: due.length };
  }

  private async catchUp(rule: RecurringRuleDocument) {
    if (!rule.autoCreate || !rule.isActive) return;
    const now = new Date();
    let guard = 0;
    while (rule.nextRun.getTime() <= now.getTime() && guard++ < 36) {
      if (rule.endDate && rule.nextRun.getTime() > rule.endDate.getTime()) {
        rule.isActive = false;
        break;
      }
      const posted = await this.post(rule, rule.nextRun);
      if (!posted) break;
      if (rule.frequency === 'once') {
        rule.isActive = false;
        break;
      }
      const nxt = nextDate(rule.nextRun, rule.frequency, rule.dayOfMonth);
      if (rule.endDate && nxt.getTime() > rule.endDate.getTime()) {
        rule.isActive = false;
        rule.nextRun = nxt;
        break;
      }
      rule.nextRun = nxt;
    }
    await rule.save();
  }

  private async post(rule: RecurringRuleDocument, date: Date) {
    try {
      await this.txs.create(String(rule.userId), {
        accountId: String(rule.accountId),
        type: rule.type || 'expense',
        date,
        amountPaise: rule.amountPaise,
        categoryId: rule.categoryId,
        subcategoryId: rule.subcategoryId,
        merchant: rule.merchant ?? rule.name,
        narration: rule.note || `Recurring: ${rule.name}`,
        source: 'recurring',
      });
      return true;
    } catch (err) {
      const msg = String(err);
      if (msg.includes('E11000') || msg.toLowerCase().includes('duplicate')) return true;
      this.log.warn(`Skip recurring post ${rule.name} ${isoDate(date)}: ${msg}`);
      return false;
    }
  }
}

export function nextDate(from: Date, freq: string, dayOfMonth?: number) {
  if (freq === 'weekly') return addWeeks(from, 1);
  if (freq === 'once') return addWeeks(from, 1);
  const months = freq === 'quarterly' ? 3 : freq === 'yearly' ? 12 : 1;
  return addMonthsOnDay(from, months, dayOfMonth ?? Number(isoDate(from).slice(8, 10)));
}

function addMonthsOnDay(from: Date, months: number, dayOfMonth: number) {
  const iso = isoDate(from);
  const [y, m] = iso.split('-').map(Number);
  let year = y;
  let month = m + months;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(dayOfMonth, last);
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return istNoon(`${year}-${mm}-${dd}`);
}
