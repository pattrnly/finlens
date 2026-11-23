export function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const rec = err as { code?: number; message?: string };
  return rec.code === 11000 || /E11000 duplicate key/i.test(rec.message ?? '');
}
