import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { familySearchText, matchFamily, type FamilyHint } from '../../common/family-match';
import { ownedFilter } from '../../common/object-id';
import { extractPayee, idsFromSlug, isSelfTransfer, MERCHANT_SEEDS } from '../statements/classify';
import { StatementRow, StatementRowDocument } from '../statements/statement.schema';
import { Transaction, TransactionDocument } from '../transactions/transaction.schema';
import { Category, CategoryDocument } from '../categories/category.schema';
import { FamilyMember, FamilyMemberDocument } from './family-member.schema';

@Injectable()
export class FamilyService {
  constructor(
    @InjectModel(FamilyMember.name) private model: Model<FamilyMemberDocument>,
    @InjectModel(StatementRow.name) private rows: Model<StatementRowDocument>,
    @InjectModel(Transaction.name) private txs: Model<TransactionDocument>,
    @InjectModel(Category.name) private categories: Model<CategoryDocument>,
  ) {}

  list(userId: string) {
    return this.model
      .find({ userId: new Types.ObjectId(userId), isActive: { $ne: false } })
      .sort({ name: 1 })
      .lean()
      .exec();
  }

  async hints(userId: string): Promise<FamilyHint[]> {
    const docs = await this.list(userId);
    return docs.map((d) => ({ name: d.name, aliases: d.aliases ?? [] }));
  }

  async create(
    userId: string,
    data: { name: string; aliases?: string[]; relation?: string },
  ) {
    const name = data.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const aliases = cleanAliases(data.aliases);
    const existing = await this.model.findOne({
      userId: new Types.ObjectId(userId),
      name: { $regex: `^${escapeRe(name)}$`, $options: 'i' },
    });
    if (existing) {
      existing.aliases = [...new Set([...(existing.aliases ?? []), ...aliases])];
      if (data.relation) existing.relation = data.relation;
      existing.isActive = true;
      await existing.save();
      const applied = await this.applyMember(userId, { name: existing.name, aliases: existing.aliases });
      return { ...this.public(existing), applied };
    }
    const doc = await this.model.create({
      userId: new Types.ObjectId(userId),
      name,
      aliases,
      relation: data.relation || 'other',
      isActive: true,
    });
    const applied = await this.applyMember(userId, { name, aliases });
    return { ...this.public(doc), applied };
  }

  async update(
    userId: string,
    id: string,
    data: Partial<{ name: string; aliases: string[]; relation: string }>,
  ) {
    const doc = await this.model.findOne(ownedFilter(userId, id, 'Family member'));
    if (!doc) throw new NotFoundException('Family member not found');
    if (data.name != null) doc.name = data.name.trim();
    if (data.aliases) doc.aliases = cleanAliases(data.aliases);
    if (data.relation) doc.relation = data.relation;
    await doc.save();
    const applied = await this.applyMember(userId, { name: doc.name, aliases: doc.aliases });
    return { ...this.public(doc), applied };
  }

  async remove(userId: string, id: string) {
    const doc = await this.model.findOne(ownedFilter(userId, id, 'Family member'));
    if (!doc) throw new NotFoundException('Family member not found');
    doc.isActive = false;
    await doc.save();
    return { id: String(doc._id), deleted: true };
  }

  private async applyMember(userId: string, member: FamilyHint) {
    const uid = new Types.ObjectId(userId);
    const cats = await this.categories
      .find({ $or: [{ isSystem: true }, { userId: uid }] })
      .lean()
      .exec();
    const transferCat = cats.find((c) => c.slug === 'transfer');
    const skip = new Set(['refund', 'reversal', 'interest', 'emi', 'part_payment']);
    const named = (merchant?: string) => (merchant ?? '').trim().toLowerCase() === member.name.trim().toLowerCase();
    let family = await this.hints(userId);
    if (!family.some((f) => f.name.toLowerCase() === member.name.toLowerCase())) {
      family = [...family, member];
    }
    const rowDocs = await this.rows
      .find({ userId: uid, classifiedBy: { $ne: 'user' } })
      .select('_id narration type merchant classifiedBy creditPaise debitPaise')
      .lean()
      .exec();
    const rowIds = rowDocs
      .filter((d) => !skip.has(String(d.type)) && matchFamily(String(d.narration ?? ''), [member]))
      .map((d) => d._id);
    const rowIdSet = new Set(rowIds.map((id) => String(id)));
    const staleRows = rowDocs.filter((d) => leftoverNonFamily(d, family, named, skip, rowIdSet));
    const txDocs = await this.txs
      .find({ userId: uid, isDeleted: false })
      .select('_id narration type merchant classifiedBy')
      .lean()
      .exec();
    const txIds = txDocs
      .filter((d) => !skip.has(String(d.type)) && matchFamily(String(d.narration ?? ''), [member]))
      .map((d) => d._id);
    const txIdSet = new Set(txIds.map((id) => String(id)));
    const staleTxs = txDocs.filter((d) => leftoverNonFamily(d, family, named, skip, txIdSet));
    const rowRes = rowIds.length
      ? await this.rows.updateMany(
          { _id: { $in: rowIds } },
          {
            $set: {
              type: 'transfer',
              merchant: member.name,
              isInternalTransfer: true,
              excludedFromSpend: true,
              classifiedBy: 'family',
              confidence: 0.96,
              ...(transferCat
                ? { categoryId: transferCat._id, subcategoryId: null }
                : {}),
            },
          },
        )
      : { modifiedCount: 0 };
    const txRes = txIds.length
      ? await this.txs.updateMany(
          { _id: { $in: txIds } },
          {
            $set: {
              type: 'transfer',
              merchant: member.name,
              excludedFromReports: true,
              ...(transferCat
                ? { categoryId: transferCat._id, subcategoryId: null }
                : {}),
            },
          },
        )
      : { modifiedCount: 0 };
    for (const row of staleRows) {
      const restored = restoreFromNarration(String(row.narration ?? ''), isCreditDoc(row));
      const ids = idsFromSlug(restored.categorySlug, cats);
      await this.rows.updateOne(
        { _id: row._id },
        {
          $set: {
            type: restored.type,
            merchant: restored.merchant,
            isInternalTransfer: restored.type === 'transfer',
            excludedFromSpend: restored.type === 'transfer',
            classifiedBy: 'rules',
            ...(ids.categoryId ? { categoryId: ids.categoryId, subcategoryId: ids.subcategoryId ?? null } : {}),
          },
        },
      );
    }
    for (const tx of staleTxs) {
      const restored = restoreFromNarration(String(tx.narration ?? ''), isCreditDoc(tx));
      const ids = idsFromSlug(restored.categorySlug, cats);
      await this.txs.updateOne(
        { _id: tx._id },
        {
          $set: {
            type: restored.type,
            merchant: restored.merchant,
            excludedFromReports: restored.type === 'transfer',
            ...(ids.categoryId ? { categoryId: ids.categoryId, subcategoryId: ids.subcategoryId ?? null } : {}),
          },
        },
      );
    }
    return { rows: rowRes.modifiedCount, txs: txRes.modifiedCount };
  }

  private public(d: FamilyMemberDocument) {
    return {
      id: String(d._id),
      name: d.name,
      aliases: d.aliases ?? [],
      relation: d.relation,
      isActive: d.isActive !== false,
    };
  }
}

function cleanAliases(aliases?: string[]) {
  return [...new Set((aliases ?? []).map((a) => a.trim()).filter(Boolean))];
}

function leftoverNonFamily(
  d: { _id: unknown; narration?: string; type?: string; merchant?: string; creditPaise?: number; classifiedBy?: string },
  family: FamilyHint[],
  named: (merchant?: string) => boolean,
  skip: Set<string>,
  matchedIds: Set<string>,
) {
  if (matchedIds.has(String(d._id))) return false;
  if (skip.has(String(d.type))) return false;
  if (d.classifiedBy === 'rule' || d.classifiedBy === 'user') return false;
  const narration = String(d.narration ?? '');
  if (matchFamily(narration, family) || isSelfTransfer(narration)) return false;
  return (
    String(d.type) === 'transfer' ||
    named(d.merchant) ||
    (Number(d.creditPaise) > 0 && String(d.type) === 'expense')
  );
}

function isCreditDoc(d: { narration?: string; type?: string; creditPaise?: number }) {
  if (Number(d.creditPaise) > 0) return true;
  const n = String(d.narration ?? '');
  if (/UPI\/CR/i.test(n)) return true;
  if (/UPI\/DR/i.test(n) || /^POS-/i.test(n)) return false;
  return ['transfer', 'income', 'refund', 'reversal', 'interest'].includes(String(d.type));
}

function restoreFromNarration(narration: string, isCredit: boolean) {
  const core = familySearchText(narration) || narration.slice(0, 220);
  const seed = MERCHANT_SEEDS.find((s) => s.pattern.test(core));
  if (seed) {
    return { type: seed.type, merchant: seed.merchant, categorySlug: seed.categorySlug };
  }
  const payee = extractPayee(core);
  return {
    type: isCredit ? 'income' : 'expense',
    merchant: payee,
    categorySlug: isCredit ? 'other-income' : undefined,
  };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
