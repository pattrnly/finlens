import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { familySearchText } from '../../common/family-match';
import { fingerprint, normalizeNarration } from '../../common/fingerprint';
import { endOfIstDay, isoDate, startOfIstDay } from '../../common/dates';
import { rupeesToPaise } from '../../common/money';
import { isDuplicateKeyError } from '../../common/mongo-error';
import { ownedFilter } from '../../common/object-id';
import { coerceTxType, TX_TYPES } from '../../common/types';
import { Account } from '../accounts/account.schema';
import { AiService } from '../ai/ai.service';
import { Category, CategoryDocument } from '../categories/category.schema';
import { ClassifyRulesService } from '../classify-rules/classify-rules.service';
import { FamilyService } from '../family/family.service';
import { RedisService } from '../redis/redis.service';
import { EMI_NARRATION_RE, finalizeRecognisedType, idsFromSlug } from '../statements/classify';
import { Transaction, TransactionDocument } from './transaction.schema';

const ALLOWED_TYPES = new Set<string>(TX_TYPES);
const CREDIT_TYPES = ['income', 'refund', 'reversal', 'interest'];
const AMOUNT_OPS = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'between']);
const SORTS: Record<string, Record<string, 1 | -1>> = {
  date_desc: { date: -1, createdAt: -1 },
  date_asc: { date: 1, createdAt: 1 },
  amount_desc: { amountPaise: -1, date: -1 },
  amount_asc: { amountPaise: 1, date: -1 },
  merchant_asc: { merchant: 1, date: -1 },
};

@Injectable()
export class TransactionsService implements OnModuleInit {
  constructor(
    @InjectModel(Transaction.name) private model: Model<TransactionDocument>,
    @InjectModel(Account.name) private accounts: Model<Account>,
    @InjectModel(Category.name) private categories: Model<CategoryDocument>,
    private cache: RedisService,
    private ai: AiService,
    private family: FamilyService,
    private classifyRules: ClassifyRulesService,
  ) {}

  async onModuleInit() {
    await this.model.updateMany({ type: 'fee' }, { $set: { type: 'expense' } });
    const emi = await this.model.updateMany(
      {
        isDeleted: false,
        type: { $in: ['expense', 'transfer'] },
        $or: [{ narration: EMI_NARRATION_RE }, { merchant: EMI_NARRATION_RE }],
      },
      { $set: { type: 'emi', excludedFromReports: false } },
    );
    if (emi.modifiedCount) await this.cache.delPattern('analytics:*');
  }

  async list(
    userId: string,
    q: {
      from?: string;
      to?: string;
      type?: string;
      accountId?: string;
      categoryId?: string;
      subcategoryId?: string;
      search?: string;
      amountOp?: string;
      amountRupees?: string;
      amountMinRupees?: string;
      amountMaxRupees?: string;
      direction?: string;
      source?: string;
      classifiedBy?: string;
      sort?: string;
    },
  ) {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    };
    const also: Record<string, unknown>[] = [];
    if (q.type) filter.type = q.type;
    else if (q.direction === 'credit') {
      also.push({ $or: [{ isCredit: true }, { isCredit: { $exists: false }, type: { $in: CREDIT_TYPES } }] });
    } else if (q.direction === 'debit') {
      also.push({ $or: [{ isCredit: false }, { isCredit: { $exists: false }, type: { $nin: CREDIT_TYPES } }] });
    }
    if (q.accountId && Types.ObjectId.isValid(q.accountId)) {
      filter.accountId = new Types.ObjectId(q.accountId);
    }
    if (q.subcategoryId && Types.ObjectId.isValid(q.subcategoryId)) {
      filter.subcategoryId = new Types.ObjectId(q.subcategoryId);
    } else if (q.categoryId && Types.ObjectId.isValid(q.categoryId)) {
      filter.categoryId = new Types.ObjectId(q.categoryId);
    }
    if (q.from || q.to) {
      filter.date = {
        ...(q.from ? { $gte: startOfIstDay(q.from) } : {}),
        ...(q.to ? { $lte: endOfIstDay(q.to) } : {}),
      };
    }
    if (q.search) {
      also.push({
        $or: [
          { narration: { $regex: q.search, $options: 'i' } },
          { merchant: { $regex: q.search, $options: 'i' } },
        ],
      });
    }
    if (also.length) filter.$and = also;
    const amount = amountFilter(q);
    if (amount) filter.amountPaise = amount;
    if (q.source === 'manual' || q.source === 'statement' || q.source === 'recurring') {
      filter.source = q.source;
    }
    if (q.classifiedBy === 'ai') filter.classifiedBy = 'ai';
    else if (q.classifiedBy === 'rule') filter.classifiedBy = { $in: ['rule', 'rules'] };
    else if (q.classifiedBy === 'user') filter.classifiedBy = 'user';
    else if (q.classifiedBy === 'family') filter.classifiedBy = 'family';
    const sort = SORTS[q.sort ?? ''] ?? SORTS.date_desc;
    return this.model.find(filter).sort(sort).limit(2000).lean().exec();
  }

  async create(
    userId: string,
    data: {
      accountId: string | Types.ObjectId;
      type: string;
      date: Date;
      amountPaise: number;
      categoryId?: Types.ObjectId | string;
      subcategoryId?: Types.ObjectId | string;
      merchant?: string;
      narration?: string;
      channel?: string;
      source?: string;
      upiRef?: string;
      balanceAfterPaise?: number;
      isCredit?: boolean;
      statementId?: Types.ObjectId | string;
      fingerprint?: string;
      counterpartyAccountId?: Types.ObjectId | string;
      excludedFromReports?: boolean;
      classifiedBy?: string;
    },
  ) {
    const account = await this.accounts.findOne({
      _id: data.accountId,
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');
    const type = coerceTxType(data.type);
    const isCredit = data.isCredit ?? CREDIT_TYPES.includes(type);
    const fp =
      data.fingerprint ||
      fingerprint({
        userId,
        accountLast4: account.last4 ?? String(account._id).slice(-4),
        date: isoDate(data.date),
        amountPaise: data.amountPaise,
        ref: data.upiRef || data.narration || normalizeNarration(String(Date.now())),
        balanceAfterPaise: data.balanceAfterPaise,
      });
    const excluded = data.excludedFromReports ?? type === 'transfer';
    const payload = {
      ...data,
      type,
      isCredit,
      userId: new Types.ObjectId(userId),
      accountId: new Types.ObjectId(String(data.accountId)),
      categoryId: data.categoryId ? new Types.ObjectId(String(data.categoryId)) : undefined,
      subcategoryId: data.subcategoryId ? new Types.ObjectId(String(data.subcategoryId)) : undefined,
      fingerprint: fp,
      excludedFromReports: excluded,
      source: data.source ?? 'manual',
      isDeleted: false,
    };
    let doc: TransactionDocument;
    try {
      doc = await this.model.create(payload);
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const existing = await this.model.findOne({
        userId: new Types.ObjectId(userId),
        fingerprint: fp,
      });
      if (!existing?.isDeleted) throw err;
      existing.set(payload);
      if (data.statementId) existing.statementId = new Types.ObjectId(String(data.statementId));
      if (data.counterpartyAccountId) {
        existing.counterpartyAccountId = new Types.ObjectId(String(data.counterpartyAccountId));
      }
      doc = await existing.save();
    }
    await this.accounts.updateOne(
      { _id: account._id },
      { $inc: { currentBalancePaise: this.delta(type, data.amountPaise) } },
    );
    await this.cache.delPattern(`analytics:${userId}:*`);
    return doc;
  }

  async update(userId: string, id: string, data: Partial<Transaction> & { amountPaise?: number }) {
    const doc = await this.model.findOne({ ...ownedFilter(userId, id, 'Transaction'), isDeleted: false });
    if (!doc) throw new NotFoundException('Transaction not found');
    const oldDelta = this.delta(doc.type, doc.amountPaise);
    const oldAccount = doc.accountId;

    if (data.accountId) doc.accountId = new Types.ObjectId(String(data.accountId));
    if (data.type) {
      doc.type = coerceTxType(data.type);
      doc.isCredit = CREDIT_TYPES.includes(doc.type);
    }
    if (data.date) doc.date = data.date as Date;
    if (data.amountPaise != null) doc.amountPaise = data.amountPaise;
    if (data.merchant !== undefined) doc.merchant = data.merchant;
    if (data.narration !== undefined) doc.narration = data.narration;
    if (data.channel) doc.channel = data.channel;
    if (data.excludedFromReports != null) doc.excludedFromReports = data.excludedFromReports;
    if (data.categoryId !== undefined) {
      doc.categoryId = data.categoryId ? new Types.ObjectId(String(data.categoryId)) : undefined;
    }
    if (data.subcategoryId !== undefined) {
      doc.subcategoryId = data.subcategoryId
        ? new Types.ObjectId(String(data.subcategoryId))
        : undefined;
    }
    if (data.classifiedBy !== undefined) doc.classifiedBy = data.classifiedBy;
    await doc.save();

    const newDelta = this.delta(doc.type, doc.amountPaise);
    if (String(oldAccount) !== String(doc.accountId) || oldDelta !== newDelta) {
      await this.accounts.updateOne({ _id: oldAccount }, { $inc: { currentBalancePaise: -oldDelta } });
      await this.accounts.updateOne({ _id: doc.accountId }, { $inc: { currentBalancePaise: newDelta } });
    }
    await this.cache.delPattern(`analytics:${userId}:*`);
    return doc;
  }

  async remove(userId: string, id: string) {
    const doc = await this.model.findOne({ ...ownedFilter(userId, id, 'Transaction'), isDeleted: false });
    if (!doc) throw new NotFoundException('Transaction not found');
    doc.isDeleted = true;
    await doc.save();
    if (doc.accountId) {
      await this.accounts.updateOne(
        { _id: doc.accountId },
        { $inc: { currentBalancePaise: -this.delta(doc.type, doc.amountPaise) } },
      );
    }
    await this.cache.delPattern(`analytics:${userId}:*`);
    return { id: String(doc._id), deleted: true };
  }

  async removeByStatement(userId: string, statementId: string) {
    if (!Types.ObjectId.isValid(statementId)) return { deleted: 0 };
    const filter = {
      userId: new Types.ObjectId(userId),
      statementId: new Types.ObjectId(statementId),
      isDeleted: false,
    };
    const docs = await this.model.find(filter);
    const byAccount = new Map<string, number>();
    for (const doc of docs) {
      if (!doc.accountId) continue;
      const key = String(doc.accountId);
      byAccount.set(key, (byAccount.get(key) ?? 0) - this.delta(doc.type, doc.amountPaise));
    }
    const result = await this.model.updateMany(filter, { $set: { isDeleted: true } });
    for (const [accountId, amount] of byAccount) {
      if (!amount) continue;
      await this.accounts.updateOne(
        { _id: new Types.ObjectId(accountId) },
        { $inc: { currentBalancePaise: amount } },
      );
    }
    await this.cache.delPattern(`analytics:${userId}:*`);
    return { deleted: result.modifiedCount };
  }

  async removeRange(userId: string, from: string, to: string) {
    const filter = {
      userId: new Types.ObjectId(userId),
      isDeleted: false,
      date: { $gte: startOfIstDay(from), $lte: endOfIstDay(to) },
    };
    const docs = await this.model.find(filter);
    const byAccount = new Map<string, number>();
    for (const doc of docs) {
      if (!doc.accountId) continue;
      const key = String(doc.accountId);
      byAccount.set(key, (byAccount.get(key) ?? 0) - this.delta(doc.type, doc.amountPaise));
    }
    const result = await this.model.updateMany(filter, { $set: { isDeleted: true } });
    for (const [accountId, amount] of byAccount) {
      if (!amount) continue;
      await this.accounts.updateOne(
        { _id: new Types.ObjectId(accountId) },
        { $inc: { currentBalancePaise: amount } },
      );
    }
    await this.cache.delPattern(`analytics:${userId}:*`);
    return { deleted: result.modifiedCount, from, to };
  }

  delta(type: string, amountPaise: number) {
    if (['income', 'refund', 'reversal', 'interest'].includes(type)) return amountPaise;
    if (type === 'transfer') return 0;
    return -amountPaise;
  }

  async recognise(
    userId: string,
    q: { from?: string; to?: string; ids?: string[]; providerId?: string },
  ) {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      isDeleted: false,
      source: { $ne: 'recurring' },
    };
    if (q.ids?.length) {
      filter._id = { $in: q.ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) };
    } else if (q.from && q.to) {
      filter.date = { $gte: startOfIstDay(q.from), $lte: endOfIstDay(q.to) };
      filter.classifiedBy = { $ne: 'user' };
    } else {
      throw new BadRequestException('Choose a month or a transaction to re-recognise.');
    }
    const docs = await this.model.find(filter).sort({ date: -1 }).limit(400).exec();
    if (!docs.length) return { updated: 0, used: null };
    const total = docs.length;
    await this.cache.setRecogniseProgress(userId, {
      status: 'running',
      phase: 'ai',
      label: `Recognising 0 of ${total}…`,
      done: 0,
      total,
      percent: 8,
    });
    try {
    const cats = await this.categories.find({
      $or: [{ isSystem: true }, { userId: new Types.ObjectId(userId) }],
    });
    const slugs = cats.map((c) => {
      const parent = c.parentId ? cats.find((p) => String(p._id) === String(c.parentId)) : undefined;
      return { slug: c.slug, name: c.name, parent: parent?.slug };
    });
    const family = await this.family.hints(userId);
    const rules = await this.classifyRules.hints(userId);
    const accs = await this.accounts.find({ userId: new Types.ObjectId(userId) }).lean().exec();
    const bankByAccount = new Map(accs.map((a) => [String(a._id), a.bank ?? '']));
    const familyNames = family.flatMap((m) => [m.name, ...(m.aliases ?? [])]);
    const hints = docs.map((tx, i) => {
      const { debitPaise, creditPaise } = splitAmount(tx);
      const raw = tx.narration || tx.merchant || '';
      return {
        i,
        narration: familySearchText(raw) || raw.slice(0, 220),
        debitPaise,
        creditPaise,
        merchant: tx.merchant,
        type: tx.type,
      };
    });
    const ai = await this.ai.classifyRows(
      userId,
      hints,
      slugs,
      q.providerId,
      familyNames,
      async (done, all) => {
        await this.cache.setRecogniseProgress(userId, {
          status: 'running',
          phase: 'ai',
          label: `Recognising ${done} of ${all}…`,
          done,
          total: all,
          percent: 8 + (done / Math.max(all, 1)) * 80,
        });
      },
    );
    const byIndex = new Map(ai.rows.map((r) => [r.i, r]));
    let updated = 0;
    for (let i = 0; i < docs.length; i++) {
      const tx = docs[i];
      const guess = byIndex.get(i);
      const { debitPaise, creditPaise } = splitAmount(tx);
      const decided = finalizeRecognisedType({
        narration: `${tx.narration ?? ''} ${tx.merchant ?? ''}`,
        isCredit: creditPaise > 0 && debitPaise === 0,
        guessedType: guess && ALLOWED_TYPES.has(guess.type) ? guess.type : tx.type,
        guessedSlug: guess?.subcategorySlug || guess?.categorySlug,
        isTransfer: guess?.isTransfer,
        family,
        rules,
        amountPaise: tx.amountPaise,
        accountId: tx.accountId ? String(tx.accountId) : undefined,
        bank: bankByAccount.get(String(tx.accountId)),
      });
      if (!decided.familyHit && !decided.ruleHit && !guess) continue;
      const nextType = coerceTxType(decided.type);
      const ids = idsFromSlug(decided.categorySlug, cats);
      const merchant = decided.familyHit?.name || decided.ruleHit?.merchant || guess?.merchant || tx.merchant;
      const classifiedBy = decided.familyHit ? 'family' : decided.ruleHit ? 'rule' : guess ? 'ai' : tx.classifiedBy;
      const excludedFromReports = nextType === 'transfer';
      const patch: Partial<Transaction> & { amountPaise?: number } = {
        type: nextType,
        merchant,
        classifiedBy,
        excludedFromReports,
      };
      if (ids.categoryId) patch.categoryId = ids.categoryId as Types.ObjectId;
      if (ids.subcategoryId) patch.subcategoryId = ids.subcategoryId as Types.ObjectId;
      else if (ids.categoryId) {
        await this.model.updateOne({ _id: tx._id }, { $unset: { subcategoryId: 1 } });
      }
      await this.update(userId, String(tx._id), patch);
      updated += 1;
    }
    await this.cache.setRecogniseProgress(userId, {
      status: 'done',
      phase: 'ai',
      label: `Recognised ${updated} transaction${updated === 1 ? '' : 's'}`,
      done: total,
      total,
      percent: 100,
    });
    return { updated, used: ai.used };
    } catch (err) {
      await this.cache.setRecogniseProgress(userId, {
        status: 'error',
        phase: 'ai',
        label: 'Recognition failed',
        done: 0,
        total,
        percent: 100,
        error: (err as Error).message,
      });
      throw err;
    }
  }
}

function parseRupees(raw?: string) {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return rupeesToPaise(n);
}

function amountFilter(q: {
  amountOp?: string;
  amountRupees?: string;
  amountMinRupees?: string;
  amountMaxRupees?: string;
}): Record<string, number> | undefined {
  const op = AMOUNT_OPS.has(q.amountOp ?? '') ? q.amountOp : undefined;
  if (!op) return undefined;
  if (op === 'between') {
    const min = parseRupees(q.amountMinRupees ?? q.amountRupees);
    const max = parseRupees(q.amountMaxRupees);
    if (min == null && max == null) return undefined;
    return {
      ...(min != null ? { $gte: min } : {}),
      ...(max != null ? { $lte: max } : {}),
    };
  }
  const paise = parseRupees(q.amountRupees);
  if (paise == null) return undefined;
  if (op === 'gt') return { $gt: paise };
  if (op === 'gte') return { $gte: paise };
  if (op === 'lt') return { $lt: paise };
  if (op === 'lte') return { $lte: paise };
  return { $eq: paise };
}

function splitAmount(tx: { type: string; amountPaise: number; narration?: string }) {
  const n = tx.narration ?? '';
  const head = n.slice(0, 80);
  if (/UPI\/CR/i.test(head) || ['income', 'refund', 'reversal', 'interest'].includes(tx.type)) {
    return { debitPaise: 0, creditPaise: tx.amountPaise };
  }
  if (/UPI\/DR/i.test(head) || /^POS-/i.test(head)) {
    return { debitPaise: tx.amountPaise, creditPaise: 0 };
  }
  if (tx.type === 'transfer') return { debitPaise: 0, creditPaise: tx.amountPaise };
  return { debitPaise: tx.amountPaise, creditPaise: 0 };
}
