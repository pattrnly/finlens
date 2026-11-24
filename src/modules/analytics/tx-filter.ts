import { Types } from 'mongoose';

export type AnalyticsFilters = {
  accountId?: string;
  categoryId?: string;
  subcategoryId?: string;
  type?: string;
};

export type FilterCat = {
  _id: Types.ObjectId | string;
  parentId?: Types.ObjectId | string | { _id?: Types.ObjectId | string } | null;
  slug?: string;
};

/** Categories that map 1:1 to a transaction type (parent slug only). */
const SLUG_TO_TYPES: Record<string, string[]> = {
  'part-payment': ['part_payment'],
  emi: ['emi'],
  transfer: ['transfer'],
  refunds: ['refund', 'reversal'],
  interest: ['interest'],
};

export function isStrictObjectId(value?: string): value is string {
  if (!value) return false;
  if (!Types.ObjectId.isValid(value)) return false;
  return String(new Types.ObjectId(value)) === value;
}

export function refId(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const v = value as { _id?: unknown; id?: unknown };
    if (v._id != null) return String(v._id);
    const s = String(value);
    if (s && s !== '[object Object]') return s;
    if (v.id != null) return String(v.id);
  }
  return String(value);
}

function typesForSlug(slug?: string): string[] {
  if (!slug) return [];
  return SLUG_TO_TYPES[slug] ?? [];
}

export function selectedCatIds(filters: AnalyticsFilters, cats: FilterCat[]): string[] {
  if (filters.subcategoryId && isStrictObjectId(filters.subcategoryId)) {
    return [filters.subcategoryId];
  }
  if (!filters.categoryId || !isStrictObjectId(filters.categoryId)) return [];
  const parent = filters.categoryId;
  const children = cats
    .filter((c) => refId(c.parentId) === parent)
    .map((c) => refId(c._id))
    .filter(Boolean);
  return [parent, ...children];
}

function impliedTypes(filters: AnalyticsFilters, cats: FilterCat[]): string[] {
  if (filters.subcategoryId) {
    return typesForSlug(cats.find((c) => refId(c._id) === filters.subcategoryId)?.slug);
  }
  const parent = cats.find((c) => refId(c._id) === filters.categoryId);
  return typesForSlug(parent?.slug);
}

function categoryMatch(ids: string[]) {
  const oids = ids.filter(isStrictObjectId).map((id) => new Types.ObjectId(id));
  if (!oids.length) return null;
  return [
    { categoryId: { $in: oids } },
    { subcategoryId: { $in: oids } },
    { categoryId: { $in: ids } },
    { subcategoryId: { $in: ids } },
  ];
}

function assignOr(find: Record<string, unknown>, clauses: object[]) {
  if (find.$or) {
    const prev = find.$or;
    delete find.$or;
    find.$and = [...((find.$and as object[]) ?? []), { $or: prev }, { $or: clauses }];
    return;
  }
  find.$or = clauses;
}

export function applyCategoryTypeFilters(
  find: Record<string, unknown>,
  filters: AnalyticsFilters,
  cats: FilterCat[],
) {
  if (filters.type) {
    find.type = filters.type === 'expense' ? { $in: ['expense', 'fee'] } : filters.type;
  }

  const ids = selectedCatIds(filters, cats);
  const catOr = ids.length ? categoryMatch(ids) : null;
  if (!catOr) return;

  const extraTypes = impliedTypes(filters, cats);
  if (filters.type || extraTypes.length === 0) {
    assignOr(find, catOr);
    return;
  }
  assignOr(find, [...catOr, { type: { $in: extraTypes } }]);
}

export function buildTxFilter(
  uid: Types.ObjectId,
  queryStart: Date,
  end: Date,
  filters: AnalyticsFilters,
  cats: FilterCat[],
) {
  const find: Record<string, unknown> = {
    userId: uid,
    isDeleted: false,
    date: { $gte: queryStart, $lte: end },
  };
  if (filters.accountId && isStrictObjectId(filters.accountId)) {
    find.accountId = new Types.ObjectId(filters.accountId);
  }
  applyCategoryTypeFilters(find, filters, cats);
  return find;
}
