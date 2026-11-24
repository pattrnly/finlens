import { Types } from 'mongoose';
import { applyCategoryTypeFilters, buildTxFilter, refId, selectedCatIds } from './tx-filter';

const uid = new Types.ObjectId();
const start = new Date('2025-01-01T00:00:00.000Z');
const end = new Date('2025-12-31T23:59:59.999Z');

const emi = new Types.ObjectId();
const emiHome = new Types.ObjectId();
const partPay = new Types.ObjectId();
const food = new Types.ObjectId();
const foodDelivery = new Types.ObjectId();
const refunds = new Types.ObjectId();
const interest = new Types.ObjectId();
const transfer = new Types.ObjectId();
const mutualFund = new Types.ObjectId();

const cats = [
  { _id: emi, slug: 'emi' },
  { _id: emiHome, slug: 'emi-home', parentId: emi },
  { _id: partPay, slug: 'part-payment' },
  { _id: food, slug: 'food' },
  { _id: foodDelivery, slug: 'food-delivery', parentId: food },
  { _id: refunds, slug: 'refunds' },
  { _id: interest, slug: 'interest' },
  { _id: transfer, slug: 'transfer' },
  { _id: mutualFund, slug: 'mutual-fund' },
];

function clauseTypes(find: Record<string, unknown>) {
  const or = (find.$or ?? []) as Array<Record<string, unknown>>;
  return or
    .map((c) => {
      const t = c.type as { $in?: string[] } | string | undefined;
      if (!t) return null;
      return Array.isArray(t.$in) ? t.$in : [t];
    })
    .filter(Boolean)
    .flat();
}

describe('analytics tx filter', () => {
  it('normalizes populated parent ids', () => {
    expect(refId({ _id: emi })).toBe(String(emi));
    expect(refId(emi)).toBe(String(emi));
    expect(refId(String(emi))).toBe(String(emi));
  });

  it('includes child category ids when a parent is selected', () => {
    const ids = selectedCatIds({ categoryId: String(food) }, cats);
    expect(ids).toEqual(expect.arrayContaining([String(food), String(foodDelivery)]));
  });

  it('matches Loan part payment by category id or type part_payment', () => {
    const find = buildTxFilter(uid, start, end, { categoryId: String(partPay) }, cats);
    expect(find.type).toBeUndefined();
    const or = find.$or as Array<Record<string, unknown>>;
    expect(or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ categoryId: expect.anything() }),
        expect.objectContaining({ subcategoryId: expect.anything() }),
        { type: { $in: ['part_payment'] } },
      ]),
    );
  });

  it('matches EMI parent by child ids or type emi', () => {
    const find = buildTxFilter(uid, start, end, { categoryId: String(emi) }, cats);
    const ids = selectedCatIds({ categoryId: String(emi) }, cats);
    expect(ids).toEqual(expect.arrayContaining([String(emi), String(emiHome)]));
    expect(clauseTypes(find)).toEqual(['emi']);
  });

  it('does not broaden Home loan subcategory to every EMI type', () => {
    const find = buildTxFilter(
      uid,
      start,
      end,
      { categoryId: String(emi), subcategoryId: String(emiHome) },
      cats,
    );
    expect(clauseTypes(find)).toEqual([]);
    const or = find.$or as Array<Record<string, unknown>>;
    const catIn = or.find((c) => c.categoryId) as { categoryId: { $in: Types.ObjectId[] } };
    expect(catIn.categoryId.$in.map(String)).toEqual([String(emiHome)]);
  });

  it('matches subcategory on categoryId or subcategoryId', () => {
    const find: Record<string, unknown> = {};
    applyCategoryTypeFilters(
      find,
      { categoryId: String(food), subcategoryId: String(foodDelivery) },
      cats,
    );
    const or = find.$or as Array<Record<string, unknown>>;
    expect(or.some((c) => 'categoryId' in c)).toBe(true);
    expect(or.some((c) => 'subcategoryId' in c)).toBe(true);
  });

  it('ORs refund and reversal when Refunds is selected', () => {
    const find = buildTxFilter(uid, start, end, { categoryId: String(refunds) }, cats);
    expect(clauseTypes(find)).toEqual(['refund', 'reversal']);
  });

  it('ORs type interest / transfer for those categories', () => {
    expect(clauseTypes(buildTxFilter(uid, start, end, { categoryId: String(interest) }, cats))).toEqual([
      'interest',
    ]);
    expect(clauseTypes(buildTxFilter(uid, start, end, { categoryId: String(transfer) }, cats))).toEqual([
      'transfer',
    ]);
  });

  it('does not OR type=investment for Mutual Fund (not 1:1)', () => {
    const find = buildTxFilter(uid, start, end, { categoryId: String(mutualFund) }, cats);
    expect(clauseTypes(find)).toEqual([]);
    expect(find.$or).toBeDefined();
  });

  it('ANDs an explicit type with the category match', () => {
    const find = buildTxFilter(
      uid,
      start,
      end,
      { categoryId: String(partPay), type: 'expense' },
      cats,
    );
    expect(find.type).toEqual({ $in: ['expense', 'fee'] });
    expect(clauseTypes(find)).toEqual([]);
  });

  it('maps expense type to expense+fee and skips category when none selected', () => {
    const find = buildTxFilter(uid, start, end, { type: 'expense' }, cats);
    expect(find.type).toEqual({ $in: ['expense', 'fee'] });
    expect(find.$or).toBeUndefined();
  });

  it('ignores invalid ids', () => {
    const find = buildTxFilter(uid, start, end, { categoryId: 'not-an-id', accountId: 'abc' }, cats);
    expect(find.$or).toBeUndefined();
    expect(find.accountId).toBeUndefined();
  });
});
