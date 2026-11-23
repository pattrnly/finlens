export function isLocalStoredPath(path: string) {
  if (!path) return false;
  return (
    /\\/.test(path) ||
    /^[a-zA-Z]:/.test(path) ||
    path.startsWith('/') ||
    path.startsWith('./') ||
    path.startsWith('uploads')
  );
}

export function s3KeyFromLocalPath(userId: string, storedPath: string, prefix = 'statements') {
  const base = storedPath.split(/[/\\]/).pop() || 'statement.pdf';
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '') || 'statements';
  return `${cleanPrefix}/${userId}/${base}`;
}

export function statementObjectKey(
  userId: string,
  filename: string,
  now = Date.now(),
  prefix = 'statements',
) {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '') || 'statements';
  const safe = filename.replace(/[^\w.-]/g, '_').slice(0, 120) || 'statement.pdf';
  const name = safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
  return `${cleanPrefix}/${userId}/${now}-${name}`;
}
