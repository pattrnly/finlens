import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AMOUNT_OPS,
  matchClassifyRule,
  ruleResult,
  type ClassifyRuleHint,
} from '../../common/classify-rule';
import { familySearchText } from '../../common/family-match';
import { rupeesToPaise } from '../../common/money';
import { ownedFilter } from '../../common/object-id';
import { coerceTxType } from '../../common/types';
import { Account } from '../accounts/account.schema';
import { Category, CategoryDocument } from '../categories/category.schema';
import { EMI_NARRATION_RE, idsFromSlug } from '../statements/classify';
import { Statement, StatementDocument, StatementRow, StatementRowDocument } from '../statements/statement.schema';
import { Transaction, TransactionDocument } from '../transactions/transaction.schema';
import { ClassifyRule, ClassifyRuleDocument } from './classify-rule.schema';

export type RuleInput = {
  pattern?: string;
  match?: string;
  direction?: string;
  type: string;
  categorySlug?: string;
  merchant?: string;
  accountId?: string | null;
  bank?: string | null;
  amountOp?: string;
  amountRupees?: number | null;
  priority?: number;
};

@Injectable()
export class ClassifyRulesService implements OnModuleInit {
  constructor(
    @InjectModel(ClassifyRule.name) private model: Model<ClassifyRuleDocument>,
    @InjectModel(StatementRow.name) private rows: Model<StatementRowDocument>,
    @InjectModel(Statement.name) private statements: Model<StatementDocument>,
    @InjectModel(Transaction.name) private txs: Model<TransactionDocument>,
    @InjectModel(Category.name) private categories: Model<CategoryDocument>,
    @InjectModel(Account.name) private accounts: Model<Account>,
  ) {}

  async onModuleInit() {
    await this.model.updateMany({ type: 'fee' }, { $set: { type: 'expense' } });
    await this.rows.updateMany({ type: 'fee' }, { $set: { type: 'expense' } });
    await this.rows.updateMany(
      {
        type: 'expense',
        $or: [{ narration: EMI_NARRATION_RE }, { merchant: EMI_NARRATION_RE }],
      },
      { $set: { type: 'emi' } },
    );
  }

  async list(userId: string) {
    const docs = await this.model
      .find({ userId: new Types.ObjectId(userId), isActive: { $ne: false } })
      .sort({ priority: -1, createdAt: 1 })
      .exec();
    return docs.map((d) => this.public(d));
  }

  async hints(userId: string): Promise<ClassifyRuleHint[]> {
    const docs = await this.list(userId);
    return docs.map((d) => toHint(d));
  }

  async create(userId: string, data: RuleInput) {
    const doc = await this.model.create({
      userId: new Types.ObjectId(userId),
      ...normalizeInput(data),
      isActive: true,
    });
    const applied = await this.applyRule(userId, toHint(doc));
    return { ...this.public(doc), applied };
  }

  async update(userId: string, id: string, data: Partial<RuleInput>) {
    const doc = await this.model.findOne(ownedFilter(userId, id, 'Rule'));
    if (!doc) throw new NotFoundException('Rule not found');
    const next = normalizeInput({
      pattern: data.pattern !== undefined ? data.pattern : doc.pattern,
      match: data.match ?? doc.match,
      direction: data.direction ?? doc.direction,
      type: data.type ?? doc.type,
      categorySlug: data.categorySlug !== undefined ? data.categorySlug : doc.categorySlug,
      merchant: data.merchant !== undefined ? data.merchant : doc.merchant,
      accountId: data.accountId !== undefined ? data.accountId : doc.accountId ? String(doc.accountId) : null,
      bank: data.bank !== undefined ? data.bank : doc.bank ?? null,
      amountOp: data.amountOp ?? doc.amountOp,
      amountRupees:
        data.amountRupees !== undefined
          ? data.amountRupees
          : doc.amountPaise != null
            ? doc.amountPaise / 100
            : null,
      priority: data.priority ?? doc.priority,
    });
    doc.pattern = next.pattern;
    doc.match = next.match;
    doc.direction = next.direction;
    doc.type = next.type;
    doc.categorySlug = next.categorySlug;
    doc.merchant = next.merchant;
    doc.set('accountId', next.accountId ?? null);
    doc.set('bank', next.bank ?? null);
    doc.amountOp = next.amountOp;
    doc.set('amountPaise', next.amountPaise ?? null);
    doc.priority = next.priority;
    await doc.save();
    const applied = await this.applyRule(userId, toHint(doc));
    return { ...this.public(doc), applied };
  }

  async remove(userId: string, id: string) {
    const doc = await this.model.findOne(ownedFilter(userId, id, 'Rule'));
    if (!doc) throw new NotFoundException('Rule not found');
    doc.isActive = false;
    await doc.save();
    return { id: String(doc._id), deleted: true };
  }

  private async applyRule(userId: string, rule: ClassifyRuleHint) {
    const uid = new Types.ObjectId(userId);
    const cats = await this.categories
      .find({ $or: [{ isSystem: true }, { userId: uid }] })
      .lean()
      .exec();
    const decided = ruleResult(rule);
    const ids = idsFromSlug(decided.categorySlug, cats);
    const accounts = await this.accounts.find({ userId: uid }).lean().exec();
    const bankByAccount = new Map(accounts.map((a) => [String(a._id), a.bank ?? '']));
    const stmts = await this.statements.find({ userId: uid }).select('_id accountId').lean().exec();
    const accountByStmt = new Map(stmts.map((s) => [String(s._id), s.accountId ? String(s.accountId) : '']));

    const rowDocs = await this.rows
      .find({ userId: uid, classifiedBy: { $nin: ['user'] } })
      .select('_id statementId narration merchant creditPaise debitPaise classifiedBy type')
      .lean()
      .exec();
    const rowIds = rowDocs
      .filter((d) => {
        const accountId = accountByStmt.get(String(d.statementId)) || '';
        return matchClassifyRule(`${d.narration ?? ''} ${d.merchant ?? ''}`, {
          isCredit: Number(d.creditPaise) > 0,
          amountPaise: Number(d.creditPaise) > 0 ? Number(d.creditPaise) : Number(d.debitPaise),
          accountId,
          bank: bankByAccount.get(accountId),
        }, [rule]);
      })
      .map((d) => d._id);
    const txDocs = await this.txs
      .find({ userId: uid, isDeleted: false, classifiedBy: { $ne: 'user' } })
      .select('_id narration merchant type classifiedBy accountId amountPaise')
      .lean()
      .exec();
    const txIds = txDocs
      .filter((d) => {
        const accountId = d.accountId ? String(d.accountId) : '';
        return matchClassifyRule(`${d.narration ?? ''} ${d.merchant ?? ''}`, {
          isCredit: isCreditTx(d),
          amountPaise: d.amountPaise,
          accountId,
          bank: bankByAccount.get(accountId),
        }, [rule]);
      })
      .map((d) => d._id);

    const setRow = {
      type: decided.type,
      classifiedBy: 'rule',
      confidence: 0.96,
      isInternalTransfer: decided.type === 'transfer',
      excludedFromSpend: decided.type === 'transfer',
      ...(decided.merchant ? { merchant: decided.merchant } : {}),
      ...(ids.categoryId ? { categoryId: ids.categoryId, subcategoryId: ids.subcategoryId ?? null } : {}),
    };
    const setTx = {
      type: decided.type,
      classifiedBy: 'rule',
      excludedFromReports: decided.type === 'transfer',
      ...(decided.merchant ? { merchant: decided.merchant } : {}),
      ...(ids.categoryId ? { categoryId: ids.categoryId, subcategoryId: ids.subcategoryId ?? null } : {}),
    };
    const rowRes = rowIds.length
      ? await this.rows.updateMany({ _id: { $in: rowIds } }, { $set: setRow })
      : { modifiedCount: 0 };
    const txRes = txIds.length
      ? await this.txs.updateMany({ _id: { $in: txIds } }, { $set: setTx })
      : { modifiedCount: 0 };
    return { rows: rowRes.modifiedCount, txs: txRes.modifiedCount };
  }

  private public(d: ClassifyRuleDocument) {
    return {
      id: String(d._id),
      pattern: d.pattern,
      match: d.match,
      direction: d.direction,
      type: d.type,
      categorySlug: d.categorySlug,
      merchant: d.merchant,
      accountId: d.accountId ? String(d.accountId) : '',
      bank: d.bank ?? '',
      amountOp: d.amountOp || 'any',
      amountPaise: d.amountPaise,
      amountRupees: d.amountPaise != null ? d.amountPaise / 100 : undefined,
      priority: d.priority,
      isActive: d.isActive !== false,
    };
  }
}

function toHint(d: {
  pattern?: string;
  match?: string;
  direction?: string;
  type: string;
  categorySlug?: string;
  merchant?: string;
  accountId?: unknown;
  bank?: string;
  amountOp?: string;
  amountPaise?: number;
}): ClassifyRuleHint {
  return {
    pattern: d.pattern ?? '',
    match: d.match,
    direction: d.direction,
    type: d.type,
    categorySlug: d.categorySlug,
    merchant: d.merchant,
    accountId: d.accountId ? String(d.accountId) : undefined,
    bank: d.bank,
    amountOp: d.amountOp,
    amountPaise: d.amountPaise,
  };
}

function normalizeInput(data: RuleInput) {
  const pattern = (data.pattern ?? '').trim();
  const match = (data.match || 'contains').toLowerCase();
  const amountOp = AMOUNT_OPS.includes((data.amountOp || 'any') as (typeof AMOUNT_OPS)[number])
    ? (data.amountOp || 'any').toLowerCase()
    : 'any';
  const rupees = Number(data.amountRupees);
  const amountPaise =
    amountOp === 'any' || !Number.isFinite(rupees) ? undefined : rupeesToPaise(rupees);
  const accountId =
    data.accountId && Types.ObjectId.isValid(String(data.accountId))
      ? new Types.ObjectId(String(data.accountId))
      : undefined;
  const bank = data.bank?.trim() || undefined;
  if (!pattern && !accountId && !bank && amountOp === 'any') {
    throw new BadRequestException('Enter match text, pick a bank, or set an amount condition.');
  }
  if (pattern && pattern.length < 2) {
    throw new BadRequestException('Enter at least 2 characters to match');
  }
  if (match === 'regex' && pattern) {
    try {
      new RegExp(pattern, 'i');
    } catch {
      throw new BadRequestException('That regex is not valid');
    }
  }
  if (amountOp !== 'any' && (amountPaise == null || Number.isNaN(amountPaise))) {
    throw new BadRequestException('Enter an amount for this condition');
  }
  return {
    pattern,
    match,
    direction: (data.direction || 'any').toLowerCase(),
    type: coerceTxType(data.type),
    categorySlug: data.categorySlug?.trim() || undefined,
    merchant: data.merchant?.trim() || undefined,
    accountId,
    bank,
    amountOp,
    amountPaise,
    priority: data.priority ?? 0,
  };
}

function isCreditTx(d: { narration?: string; type?: string }) {
  const n = familySearchText(String(d.narration ?? '')) || String(d.narration ?? '');
  if (/UPI\/CR/i.test(n)) return true;
  if (/UPI\/DR/i.test(n) || /^POS-/i.test(n)) return false;
  return ['income', 'refund', 'reversal', 'interest'].includes(String(d.type));
}
