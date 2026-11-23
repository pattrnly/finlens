export const TX_TYPES = [
  'expense',
  'income',
  'transfer',
  'investment',
  'refund',
  'reversal',
  'emi',
  'interest',
  'part_payment',
] as const;
export type TxType = (typeof TX_TYPES)[number];

const TX_TYPE_SET = new Set<string>(TX_TYPES);

export function coerceTxType(type?: string): TxType {
  if (type === 'fee') return 'expense';
  if (type && TX_TYPE_SET.has(type)) return type as TxType;
  return 'expense';
}

export const CHANNELS = [
  'upi',
  'pos',
  'imps',
  'neft',
  'rtgs',
  'interest',
  'other',
] as const;
export type Channel = (typeof CHANNELS)[number];

export const ACCOUNT_TYPES = [
  'savings',
  'salary',
  'current',
  'cash',
  'upi_wallet',
  'credit_card',
  'loan',
  'investment',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CATEGORY_KINDS = [
  'expense',
  'income',
  'investment',
  'transfer',
  'system',
] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
