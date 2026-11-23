/** Parse JSON from chat models that add fences, trailing commas, or unquoted keys. */

export function parseLlmJson<T>(raw: string): T {
  const cleaned = extractJsonText(raw);
  const attempts = [cleaned, repairLlmJson(cleaned)];
  let lastErr: SyntaxError | undefined;
  for (const text of attempts) {
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      lastErr = err as SyntaxError;
    }
  }
  const salvaged = salvageRows(cleaned);
  if (salvaged) return salvaged as T;
  throw lastErr ?? new SyntaxError('AI did not return JSON');
}

export function extractJsonText(raw: string) {
  let s = String(raw ?? '').replace(/^\uFEFF/, '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  const start = s.search(/[\{\[]/);
  if (start < 0) return s;
  return s.slice(start);
}

export function repairLlmJson(raw: string) {
  let s = extractJsonText(raw);
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/.*$/gm, '$1');
  s = quoteUnquotedKeys(s);
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s.trim();
}

function quoteUnquotedKeys(json: string) {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const rest = json.slice(i);
      const m = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)(\s*):/);
      if (m) {
        out += `"${m[1]}"${m[2]}:`;
        i += m[0].length - 1;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

function salvageRows(raw: string): { rows: unknown[] } | null {
  const s = repairLlmJson(raw);
  const marker = s.match(/"rows"\s*:\s*\[/);
  if (!marker || marker.index == null) return null;
  const rows: unknown[] = [];
  let i = marker.index + marker[0].length;
  while (i < s.length) {
    const next = s.indexOf('{', i);
    if (next < 0) break;
    const obj = sliceBalancedObject(s, next);
    if (!obj) break;
    try {
      rows.push(JSON.parse(obj));
    } catch {
      break;
    }
    i = next + obj.length;
  }
  return rows.length ? { rows } : null;
}

function sliceBalancedObject(s: string, start: number) {
  if (s[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
