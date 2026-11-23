export type FamilyHint = {
  name: string;
  aliases?: string[];
};

const NOISE = new Set([
  'upi',
  'neft',
  'imps',
  'rtgs',
  'aubl',
  'hdfc',
  'icici',
  'sbin',
  'utib',
  'idfb',
  'indb',
  'yesb',
  'kkbk',
  'paytm',
  'phonepe',
  'gpay',
  'bank',
  'self',
  'own',
  'account',
  'from',
  'transfer',
  'credit',
  'debit',
]);

const FOOTER =
  /\s*[•·]\s*|Unless the constituent|IMPORTANT MESSAGE|This is a system generated|Page \d+ of \d+/i;

export function familySearchText(narration: string) {
  if (!narration) return '';
  const cut = narration.search(FOOTER);
  const head = (cut >= 0 ? narration.slice(0, cut) : narration).trim();
  return head.slice(0, 220);
}

export function normalizeFamilyText(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function familyTokens(member: FamilyHint): string[] {
  const out = new Set<string>();
  for (const raw of [member.name, ...(member.aliases ?? [])]) {
    const n = normalizeFamilyText(raw);
    if (!n) continue;
    const parts = n.split(' ').filter((p) => p && !NOISE.has(p));
    if (!parts.length) continue;
    addToken(out, parts.join(''));
    for (const part of parts) addToken(out, part);
  }
  return [...out];
}

export function matchFamily(narration: string, members: FamilyHint[]): FamilyHint | undefined {
  if (!narration || !members.length) return undefined;
  const hay = normalizeFamilyText(familySearchText(narration));
  if (!hay) return undefined;
  const words = hay.split(' ').filter(Boolean);
  const compact = words.join('');
  for (const member of members) {
    for (const token of familyTokens(member)) {
      if (familyTokenHits(token, words, compact)) return member;
    }
  }
  return undefined;
}

/** `sonal` hits SONALBEN; `utsav` hits utsavhi. Does not hit `personal`. */
export function familyTokenHits(token: string, words: string[], compact: string) {
  if (!token) return false;
  if (token.length >= 6 && compact.includes(token)) return true;
  for (const w of words) {
    if (w === token) return true;
    if (token.length >= 4 && w.startsWith(token)) return true;
    if (w.length >= 4 && token.startsWith(w)) return true;
  }
  return false;
}

export function familyMatchRegex(members: FamilyHint[]) {
  const tokens = [...new Set(members.flatMap(familyTokens))];
  if (!tokens.length) return null;
  return new RegExp(`(?:^|[^a-z0-9])(?:${tokens.map(escapeRe).join('|')})(?:[^a-z0-9]|$)`, 'i');
}

function addToken(out: Set<string>, token: string) {
  if (token.length < 4 || NOISE.has(token)) return;
  out.add(token);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
