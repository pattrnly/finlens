import { familySearchText } from './family-match';
import { coerceTxType, type TxType } from './types';

export const MATCH_MODES = ['contains', 'exact', 'starts_with', 'ends_with', 'words', 'regex'] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export const RULE_DIRECTIONS = ['credit', 'debit', 'any'] as const;
export type RuleDirection = (typeof RULE_DIRECTIONS)[number];

export const AMOUNT_OPS = ['any', 'gt', 'gte', 'lt', 'lte', 'eq'] as const;
export type AmountOp = (typeof AMOUNT_OPS)[number];

export type RuleMatchCtx = {
  isCredit: boolean;
  amountPaise?: number;
  accountId?: string;
  bank?: string;
};

export type ClassifyRuleHint = {
  pattern: string;
  match?: string;
  direction?: string;
  type: string;
  categorySlug?: string;
  merchant?: string;
  accountId?: string;
  bank?: string;
  amountOp?: string;
  amountPaise?: number;
};

export function defaultSlugForType(type: string) {
  switch (type) {
    case 'investment':
      return 'other-investment';
    case 'income':
      return 'other-income';
    case 'transfer':
      return 'transfer';
    case 'refund':
    case 'reversal':
      return 'refunds';
    case 'interest':
      return 'interest';
    case 'emi':
      return 'emi';
    case 'part_payment':
      return 'part-payment';
    default:
      return 'uncategorized';
  }
}

export function matchClassifyRule(
  narration: string,
  isCreditOrCtx: boolean | RuleMatchCtx,
  rules: ClassifyRuleHint[],
): ClassifyRuleHint | undefined {
  if (!rules.length) return undefined;
  const ctx: RuleMatchCtx =
    typeof isCreditOrCtx === 'boolean' ? { isCredit: isCreditOrCtx } : isCreditOrCtx;
  for (const rule of rules) {
    if (!directionOk(rule.direction, ctx.isCredit)) continue;
    if (!bankOk(rule, ctx)) continue;
    if (!amountOk(rule, ctx.amountPaise)) continue;
    const pattern = (rule.pattern ?? '').trim();
    if (pattern && !patternHits(narration, pattern, rule.match)) continue;
    if (!pattern && !rule.accountId && !rule.bank && !hasAmountConstraint(rule)) continue;
    return rule;
  }
  return undefined;
}

function hasAmountConstraint(rule: ClassifyRuleHint) {
  const op = (rule.amountOp || 'any').toLowerCase();
  return op !== 'any' && rule.amountPaise != null && rule.amountPaise >= 0;
}

function bankOk(rule: ClassifyRuleHint, ctx: RuleMatchCtx) {
  if (rule.accountId) {
    return Boolean(ctx.accountId && String(ctx.accountId) === String(rule.accountId));
  }
  if (rule.bank?.trim()) {
    const want = normalize(rule.bank);
    const have = normalize(ctx.bank ?? '');
    return Boolean(want && have && (have === want || have.includes(want) || want.includes(have)));
  }
  return true;
}

function amountOk(rule: ClassifyRuleHint, amountPaise?: number) {
  const op = (rule.amountOp || 'any').toLowerCase();
  if (op === 'any' || rule.amountPaise == null) return true;
  const amt = amountPaise ?? 0;
  const n = rule.amountPaise;
  if (op === 'gt') return amt > n;
  if (op === 'gte') return amt >= n;
  if (op === 'lt') return amt < n;
  if (op === 'lte') return amt <= n;
  if (op === 'eq') return amt === n;
  return true;
}

function directionOk(direction: string | undefined, isCredit: boolean) {
  const d = (direction || 'any').toLowerCase();
  if (d === 'credit') return isCredit;
  if (d === 'debit') return !isCredit;
  return true;
}

export function patternHits(narration: string, pattern: string, mode?: string) {
  const raw = (pattern ?? '').trim();
  if (!raw) return false;
  const core = familySearchText(narration) || narration;
  const match = (mode || 'contains').toLowerCase();
  if (match === 'regex') {
    try {
      return new RegExp(raw, 'i').test(core);
    } catch {
      return false;
    }
  }
  const hay = normalize(core);
  const needle = normalize(raw);
  if (!hay || !needle) return false;
  const compactHay = hay.replace(/\s+/g, '');
  const compactNeedle = needle.replace(/\s+/g, '');
  const fields = hay.split(' ').filter(Boolean);
  if (match === 'exact') {
    return hay === needle || compactHay === compactNeedle || fieldJoinEquals(core, needle);
  }
  if (match === 'starts_with') {
    return hay.startsWith(needle) || compactHay.startsWith(compactNeedle) || fields.some((f) => f.startsWith(compactNeedle) || f.startsWith(needle.replace(/\s+/g, '')));
  }
  if (match === 'ends_with') {
    return hay.endsWith(needle) || compactHay.endsWith(compactNeedle) || fields.some((f) => f.endsWith(compactNeedle));
  }
  if (match === 'words') {
    const parts = needle.split(' ').filter(Boolean);
    return parts.every((p) => fields.some((f) => f === p || f.includes(p)));
  }
  return hay.includes(needle) || compactHay.includes(compactNeedle);
}

function fieldJoinEquals(narration: string, needle: string) {
  const parts = narration
    .split(/[/|,]+/)
    .map((p) => normalize(p))
    .filter(Boolean);
  return parts.includes(needle);
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ruleResult(rule: ClassifyRuleHint): { type: TxType; categorySlug: string; merchant?: string } {
  const type = coerceTxType(rule.type);
  return {
    type,
    categorySlug: rule.categorySlug || defaultSlugForType(type),
    merchant: rule.merchant?.trim() || undefined,
  };
}
