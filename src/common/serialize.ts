import { StreamableFile } from '@nestjs/common';

function isObjectId(value: unknown): boolean {
  if (typeof value !== 'object' || value == null) return false;
  const rec = value as { _bsontype?: string; toHexString?: unknown; constructor?: { name?: string } };
  if (rec._bsontype === 'ObjectId') return true;
  if (rec.constructor?.name === 'ObjectId' && typeof rec.toHexString === 'function') return true;
  return false;
}

export function toPlain(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (isObjectId(value)) return String(value);
  if (value instanceof StreamableFile) return value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value;

  const record = value as {
    toJSON?: () => unknown;
    $__?: unknown;
    _id?: unknown;
    id?: unknown;
  };

  if (typeof record.toJSON === 'function' && record.$__) {
    return toPlain(record.toJSON());
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record as Record<string, unknown>)) {
    if (key === '__v' || key === '$__' || key === '$isNew' || key.startsWith('$')) continue;
    if (key === '_id') {
      out.id = String(val);
      continue;
    }
    out[key] = toPlain(val);
  }
  if (record._id && out.id == null) out.id = String(record._id);
  return out;
}
