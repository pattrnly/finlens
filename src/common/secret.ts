import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

function keyFrom(secret: string) {
  return scryptSync(secret, 'finlens-ai-providers', 32);
}

export function encryptSecret(plain: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(packed: string, secret: string) {
  const [ivHex, tagHex, dataHex] = packed.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid secret');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

export function keyHint(key: string) {
  const trimmed = key.trim();
  if (trimmed.length <= 4) return '••••';
  return `••••${trimmed.slice(-4)}`;
}
