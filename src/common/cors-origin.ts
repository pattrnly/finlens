const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
];

export function clientOrigins(clientUrl = process.env.CLIENT_URL): string[] {
  const fromEnv = String(clientUrl ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return [...new Set([...fromEnv, ...DEV_ORIGINS])];
}

export function isAllowedCorsOrigin(origin: string | undefined, clientUrl = process.env.CLIENT_URL): boolean {
  if (!origin) return true;
  const allow = clientOrigins(clientUrl);
  const incoming = parseOrigin(origin);
  if (!incoming) return false;
  if (allow.includes(incoming.href.replace(/\/$/, ''))) return true;
  if (LOCAL_HOSTS.has(incoming.hostname)) return true;
  return allow.some((item) => {
    const allowed = parseOrigin(item);
    return Boolean(allowed && allowed.hostname === incoming.hostname);
  });
}

function parseOrigin(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}
