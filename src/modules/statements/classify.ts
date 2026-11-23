import { matchClassifyRule, ruleResult, type ClassifyRuleHint } from '../../common/classify-rule';
import { familySearchText, matchFamily, type FamilyHint } from '../../common/family-match';
import { extractUpiRrn, normalizeNarration } from '../../common/fingerprint';
import { coerceTxType, type Channel, type TxType } from '../../common/types';
import type { ClassifiedRow, ExtractedRow } from './parsers/types';

export interface MerchantHint {
  normalizedPayee: string;
  type?: string;
  categorySlug?: string;
  displayName?: string;
}

export const MERCHANT_SEEDS: Array<{
  pattern: RegExp;
  merchant: string;
  type: TxType;
  categorySlug: string;
  channel?: Channel;
}> = [
  { pattern: /SWIGGY/i, merchant: 'Swiggy', type: 'expense', categorySlug: 'food-delivery' },
  { pattern: /ZOMATO/i, merchant: 'Zomato', type: 'expense', categorySlug: 'food-delivery' },
  { pattern: /MAGICPIN/i, merchant: 'Magicpin', type: 'expense', categorySlug: 'food-delivery' },
  { pattern: /KAMDHENU/i, merchant: 'Kamdhenu', type: 'expense', categorySlug: 'food-snacks' },
  { pattern: /STARBUCKS|CCD\b|CAFE COFFEE/i, merchant: 'Cafe', type: 'expense', categorySlug: 'food-cafe' },

  { pattern: /ZEPTO/i, merchant: 'Zepto', type: 'expense', categorySlug: 'groceries-online' },
  { pattern: /INSTAMART|BLINKIT|GROFERS/i, merchant: 'Quick commerce', type: 'expense', categorySlug: 'groceries-online' },
  { pattern: /AVENUES|DMART|D-MART|BIG BAZAAR|RELIANCE FRESH|MORE SUPER/i, merchant: 'Supermarket', type: 'expense', categorySlug: 'groceries-supermarket' },

  { pattern: /HPCL|BPCL|IOCL|INDIAN OIL|BHARAT PETROLEUM|HINDUSTAN PETROLEUM|NAYARA|SHELL|PETROL|DIESEL|FUEL/i, merchant: 'Fuel', type: 'expense', categorySlug: 'transport-fuel' },
  { pattern: /\bUBER\b|\bOLA\b|RAPIDO|Namma Yatri/i, merchant: 'Cab', type: 'expense', categorySlug: 'transport-cab' },
  { pattern: /GSRTC|BEST BUS|DTC BUS|BMTC/i, merchant: 'Bus', type: 'expense', categorySlug: 'transport-transit' },
  { pattern: /METRO RAIL|DMRC|MMRCL|BMRC|CHENNAI METRO/i, merchant: 'Metro', type: 'expense', categorySlug: 'transport-transit' },
  { pattern: /FASTAG|FASTag|TOLL/i, merchant: 'Fastag', type: 'expense', categorySlug: 'transport-tolls' },

  { pattern: /AMAZON|AMZN/i, merchant: 'Amazon', type: 'expense', categorySlug: 'shopping-online' },
  { pattern: /FLIPKART|FLIP\/YESB/i, merchant: 'Flipkart', type: 'expense', categorySlug: 'shopping-online' },
  { pattern: /AJIO|MYNTRA|NYKAA/i, merchant: 'Fashion', type: 'expense', categorySlug: 'shopping-clothing' },
  { pattern: /CROMA|VIJAY SALES|RELIANCEDIGITAL/i, merchant: 'Electronics', type: 'expense', categorySlug: 'shopping-electronics' },

  { pattern: /AIRTEL|JIO\b|VI INDIA|VODAFONE|IDEA/i, merchant: 'Telecom', type: 'expense', categorySlug: 'utilities-telecom' },
  { pattern: /TATA POWER|ADANI ELEC|BESCOM|MSEB|MSEDCL|BSES|TORRENT POWER/i, merchant: 'Electricity', type: 'expense', categorySlug: 'utilities-electricity' },
  { pattern: /INDANE|HP GAS|BHARAT GAS/i, merchant: 'LPG', type: 'expense', categorySlug: 'utilities-gas' },
  { pattern: /DEPARTMENT OF POSTS|SBIEPAY/i, merchant: 'India Post', type: 'expense', categorySlug: 'utilities' },

  { pattern: /NOBROKER|HOUSING\.COM/i, merchant: 'Housing', type: 'expense', categorySlug: 'housing-rent' },

  { pattern: /PHARMEASY|1MG|NETMEDS|APOLLO PHARMACY|MEDPLUS/i, merchant: 'Pharmacy', type: 'expense', categorySlug: 'healthcare-pharmacy' },
  { pattern: /PRACTO|APOLLO HOSP/i, merchant: 'Clinic', type: 'expense', categorySlug: 'healthcare-doctor' },

  { pattern: /NETFLIX|HOTSTAR|SONYLIV|ZEE5|PRIME VIDEO|SPOTIFY|YOUTUBE PREMIUM/i, merchant: 'OTT', type: 'expense', categorySlug: 'entertainment-ott' },
  { pattern: /PVR|INOX|BOOKMYSHOW/i, merchant: 'Movies', type: 'expense', categorySlug: 'entertainment-movies' },

  { pattern: /IRCTC/i, merchant: 'IRCTC', type: 'expense', categorySlug: 'travel-trains' },
  { pattern: /INDIGO|AIR INDIA|SPICEJET|AKASA|MAKE MY TRIP|MAKEMYTRIP|GOIBIBO|CLEARTRIP/i, merchant: 'Travel', type: 'expense', categorySlug: 'travel-flights' },
  { pattern: /OYO\b|AIRBNB/i, merchant: 'Stay', type: 'expense', categorySlug: 'travel-hotels' },

  { pattern: /\bLIC\b|STAR HEALTH|HDFC ERGO|ICICI LOMBARD/i, merchant: 'Insurance', type: 'expense', categorySlug: 'insurance' },

  { pattern: /GROWW|GR0WW/i, merchant: 'Groww', type: 'investment', categorySlug: 'mutual-fund' },
  { pattern: /ZERODHA|UPSTOX|ANGEL ONE|KUVERA/i, merchant: 'Broker', type: 'investment', categorySlug: 'stocks' },

  { pattern: /INTEREST PAYOUT|MONTHLY INTEREST|:Int\.Pd/i, merchant: 'Bank Interest', type: 'interest', categorySlug: 'interest' },
  { pattern: /PHONEPE.*REVERSAL|REVERSAL FOR TXN/i, merchant: 'PhonePe', type: 'reversal', categorySlug: 'refunds' },
  { pattern: /SALARY|PAYROLL/i, merchant: 'Salary', type: 'income', categorySlug: 'salary' },
  { pattern: /\bEMI\b|ACH D-\s*HDFC BANK|\bEHDF|HDFC LTD|\bNACH\b.*\b(EMI|LOAN)\b|\bLOAN\s*(EMI|INSTAL)/i, merchant: 'EMI', type: 'emi', categorySlug: 'emi' },
];

export function classifyRow(
  row: ExtractedRow,
  learned: MerchantHint[],
  accountLast4s: string[],
  family: FamilyHint[] = [],
  rules: ClassifyRuleHint[] = [],
  ctx?: { accountId?: string; bank?: string },
): ClassifiedRow {
  const n = familySearchText(row.narration) || row.narration;
  const channel = detectChannel(n);
  const upiRef = row.upiRef ?? extractUpiRrn(n);
  const payee = extractPayee(n);
  const normalized = normalizeNarration(payee || n);

  const isCredit = row.creditPaise > 0;
  let type: TxType = isCredit ? 'income' : 'expense';
  let categorySlug = isCredit ? 'other-income' : 'uncategorized';
  let merchant = payee;
  let confidence = 0.4;
  let excludedFromSpend = false;
  let classifiedBy: ClassifiedRow['classifiedBy'] = 'rules';

  if (/UPI\/REF/i.test(n) || /\bREFUND\b/i.test(n)) {
    type = 'refund';
    categorySlug = 'refunds';
    confidence = 0.92;
    excludedFromSpend = false;
  } else if (/REVERSAL/i.test(n)) {
    type = 'reversal';
    categorySlug = 'refunds';
    confidence = 0.92;
    excludedFromSpend = false;
  } else if (/INTEREST PAYOUT|MONTHLY INTEREST|\bINTEREST CR\b|:Int\.Pd/i.test(n)) {
    type = 'interest';
    categorySlug = 'interest';
    confidence = 0.95;
    excludedFromSpend = false;
  } else if (looksLikeEmi(n, isCredit)) {
    type = 'emi';
    categorySlug = 'emi';
    merchant = merchant || 'EMI';
    confidence = 0.9;
  } else if (looksLikePartPayment(n, isCredit)) {
    type = 'part_payment';
    categorySlug = 'part-payment';
    merchant = merchant || 'Loan part payment';
    confidence = 0.9;
  }

  const seed = MERCHANT_SEEDS.find((s) => s.pattern.test(n));
  if (seed) {
    merchant = seed.merchant;
    type = seed.type;
    categorySlug = seed.categorySlug;
    confidence = 0.85;
  }

  const learnedHit = learned.find(
    (m) => m.normalizedPayee && normalized.includes(m.normalizedPayee),
  );
  if (learnedHit?.type) {
    type = learnedHit.type as TxType;
    categorySlug = learnedHit.categorySlug ?? categorySlug;
    merchant = learnedHit.displayName ?? merchant;
    confidence = 0.92;
  }

  const ruleHit = matchClassifyRule(
    n,
    {
      isCredit,
      amountPaise: isCredit ? row.creditPaise : row.debitPaise,
      accountId: ctx?.accountId,
      bank: ctx?.bank,
    },
    rules,
  );
  if (ruleHit) {
    const decided = ruleResult(ruleHit);
    type = decided.type;
    categorySlug = decided.categorySlug;
    if (decided.merchant) merchant = decided.merchant;
    excludedFromSpend = type === 'transfer';
    confidence = 0.96;
    classifiedBy = 'rule';
  }

  if (
    isSelfTransfer(n, accountLast4s) &&
    type !== 'refund' &&
    type !== 'reversal' &&
    type !== 'interest' &&
    type !== 'emi' &&
    type !== 'part_payment'
  ) {
    type = 'transfer';
    categorySlug = 'transfer';
    excludedFromSpend = true;
    confidence = 0.9;
    classifiedBy = classifiedBy === 'rule' ? classifiedBy : 'rules';
  }

  const familyHit = matchFamily(n, family);
  if (
    familyHit &&
    type !== 'refund' &&
    type !== 'reversal' &&
    type !== 'interest' &&
    type !== 'emi' &&
    type !== 'part_payment' &&
    !looksLikeInboundBankCredit(n, isCredit)
  ) {
    type = 'transfer';
    categorySlug = 'transfer';
    merchant = familyHit.name;
    excludedFromSpend = true;
    confidence = 0.97;
    classifiedBy = 'family';
  }

  return {
    ...row,
    upiRef,
    type: coerceTxType(type),
    channel,
    merchant,
    categorySlug,
    confidence,
    excludedFromSpend,
    classifiedBy,
  };
}

export function looksLikeEmi(narration: string, isCredit: boolean) {
  if (isCredit) return false;
  const n = narration || '';
  return (
    /\bEMI\b/i.test(n) ||
    /ACH D-\s*HDFC BANK/i.test(n) ||
    /\bEHDF/i.test(n) ||
    /HDFC LTD/i.test(n) ||
    /\bNACH\b.*\b(EMI|LOAN)\b/i.test(n) ||
    /\bLOAN\s*(EMI|INSTAL)/i.test(n) ||
    /\bECS\b.*\b(EMI|LOAN)\b/i.test(n)
  );
}

export function looksLikePartPayment(narration: string, isCredit: boolean) {
  if (isCredit) return false;
  const n = narration || '';
  if (looksLikeEmi(n, isCredit) && !/\bPART[\s-]?PAY/i.test(n) && !/\bPRE[\s-]?PAY/i.test(n)) return false;
  return (
    /\bPART[\s-]?PAY(MENT)?\b/i.test(n) ||
    /\bPRE[\s-]?PAY(MENT)?\b/i.test(n) ||
    /\bPREPAYMENT\b/i.test(n) ||
    /\bFORECLOS/i.test(n) ||
    /\bPRINCIPAL\s+(PRE)?PAY/i.test(n)
  );
}

export const EMI_NARRATION_RE =
  /\bEMI\b|ACH D-\s*HDFC BANK|\bEHDF|HDFC LTD|\bNACH\b.*\b(EMI|LOAN)\b|\bLOAN\s*(EMI|INSTAL)|\bECS\b.*\b(EMI|LOAN)\b/i;

export function looksLikeInboundBankCredit(narration: string, isCredit: boolean) {
  if (!isCredit) return false;
  const n = narration || '';
  if (/UPI\/(?:CR|DR|REF)/i.test(n)) return false;
  return /^(DEP TFR|CREDIT)\b/i.test(n) || /\bNEFT\*/i.test(n) || /\bCMPIFT\//i.test(n);
}

export function isSelfTransfer(narration: string, last4s: string[] = []) {
  const n = familySearchText(narration) || narration;
  if (last4s.some((l4) => l4 && n.includes(l4))) return true;
  return /\b(SELF|OWN A\/C|OWN AC|MY ACCOUNT|TO SELF|FROM SELF)\b/i.test(n);
}

const SPECIAL_CREDIT = new Set(['refund', 'reversal', 'interest']);

export function finalizeRecognisedType(input: {
  narration: string;
  isCredit: boolean;
  guessedType?: string;
  guessedSlug?: string;
  isTransfer?: boolean;
  family: FamilyHint[];
  last4s?: string[];
  rules?: ClassifyRuleHint[];
  amountPaise?: number;
  accountId?: string;
  bank?: string;
}): {
  type: TxType;
  familyHit?: FamilyHint;
  ruleHit?: ClassifyRuleHint;
  categorySlug: string;
  classifiedBy: 'family' | 'ai' | 'rules' | 'rule';
} {
  const familyHit = matchFamily(input.narration, input.family);
  const guessed = coerceTxType(input.guessedType || (input.isCredit ? 'income' : 'expense'));
  const emi = guessed === 'emi' || looksLikeEmi(input.narration, input.isCredit);
  const partPayment =
    guessed === 'part_payment' || looksLikePartPayment(input.narration, input.isCredit);
  if (
    familyHit &&
    !SPECIAL_CREDIT.has(guessed) &&
    !emi &&
    !partPayment &&
    !looksLikeInboundBankCredit(input.narration, input.isCredit)
  ) {
    return { type: 'transfer', familyHit, categorySlug: 'transfer', classifiedBy: 'family' };
  }
  const ruleHit = matchClassifyRule(
    input.narration,
    {
      isCredit: input.isCredit,
      amountPaise: input.amountPaise,
      accountId: input.accountId,
      bank: input.bank,
    },
    input.rules ?? [],
  );
  if (ruleHit) {
    const decided = ruleResult(ruleHit);
    return {
      type: decided.type,
      ruleHit,
      categorySlug: decided.categorySlug,
      classifiedBy: 'rule',
    };
  }
  if (isSelfTransfer(input.narration, input.last4s) && !SPECIAL_CREDIT.has(guessed) && !emi && !partPayment) {
    return { type: 'transfer', categorySlug: 'transfer', classifiedBy: 'rules' };
  }
  if (partPayment && guessed === 'part_payment') {
    return {
      type: 'part_payment',
      categorySlug: input.guessedSlug || 'part-payment',
      classifiedBy: input.guessedType ? 'ai' : 'rules',
    };
  }
  if (emi) {
    return {
      type: 'emi',
      categorySlug: input.guessedSlug || 'emi',
      classifiedBy: input.guessedType ? 'ai' : 'rules',
    };
  }
  if (partPayment) {
    return {
      type: 'part_payment',
      categorySlug: input.guessedSlug || 'part-payment',
      classifiedBy: input.guessedType ? 'ai' : 'rules',
    };
  }
  if (SPECIAL_CREDIT.has(guessed)) {
    return {
      type: guessed,
      categorySlug: input.guessedSlug || guessed,
      classifiedBy: input.guessedType ? 'ai' : 'rules',
    };
  }
  let type: TxType = guessed;
  if (type === 'transfer' || input.isTransfer) {
    type = input.isCredit ? 'income' : 'expense';
  }
  const keepGuessedSlug = Boolean(input.guessedSlug) && type === guessed;
  const categorySlug = keepGuessedSlug
    ? input.guessedSlug!
    : type === 'income'
      ? 'other-income'
      : type === 'expense'
        ? 'uncategorized'
        : type;
  return { type, categorySlug, classifiedBy: input.guessedType ? 'ai' : 'rules' };
}

export function detectChannel(n: string): Channel {
  if (/^POS-|\bPOS\b/i.test(n)) return 'pos';
  if (/\bIMPS/i.test(n)) return 'imps';
  if (/\bNEFT/i.test(n)) return 'neft';
  if (/\bRTGS/i.test(n)) return 'rtgs';
  if (/INTEREST|:Int\.Pd/i.test(n)) return 'interest';
  if (/\bUPI\b/i.test(n)) return 'upi';
  return 'other';
}

export function extractPayee(n: string): string {
  const upi = n.match(/UPI\/(?:DR|CR|REF)\/\d+\/([^/]+)/i);
  if (upi) return upi[1].replace(/\s+/g, ' ').trim();
  const indus = n.match(/UPI\/\d+\/(?:DR|CR)\/\s*(?:[A-Z]\d{5,}\s+)?([^/\s]+)/i);
  if (indus) return indus[1].replace(/\s+/g, ' ').trim();
  const pos = n.match(/POS-[A-Z]+\/([^/]+)/i);
  if (pos) return pos[1].trim();
  return n.slice(0, 40);
}

export function reconcile(
  opening: number,
  rows: ExtractedRow[],
  statedClosing: number,
): { matched: boolean; delta: number; computedClosing: number } {
  const computed =
    opening +
    rows.reduce((s, r) => s + r.creditPaise - r.debitPaise, 0);
  const delta = computed - statedClosing;
  return { matched: Math.abs(delta) <= 1, delta, computedClosing: computed };
}

export function idsFromSlug(
  slug: string | undefined,
  cats: Array<{ slug: string; _id: unknown; parentId?: unknown }>,
) {
  if (!slug) return {};
  const cat = cats.find((c) => c.slug === slug);
  if (!cat) return {};
  if (cat.parentId) {
    return { categoryId: cat.parentId, subcategoryId: cat._id };
  }
  return { categoryId: cat._id };
}
