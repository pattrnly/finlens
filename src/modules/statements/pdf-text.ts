import { join } from 'path';
import { pathToFileURL } from 'url';

type PdfJsDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: PdfItem[] }>;
  }>;
};

type PdfItem = { str?: string; transform?: number[]; width?: number };

export async function unlockPdf(buffer: Buffer, password?: string): Promise<Buffer> {
  await openPdf(buffer, password);
  return buffer;
}

export async function extractPdfText(buffer: Buffer, password?: string): Promise<string> {
  const pdf = await openPdf(buffer, password);
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(itemsToLines(content.items));
  }
  return pages.join('\n\n-- PAGE BREAK --\n\n');
}

async function openPdf(buffer: Buffer, password?: string): Promise<PdfJsDoc> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = join(
    process.cwd(),
    'node_modules',
    'pdfjs-dist',
    'legacy',
    'build',
    'pdf.worker.mjs',
  );
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0,
    password: password || '',
  } as never);
  try {
    return (await loadingTask.promise) as PdfJsDoc;
  } catch (err) {
    throw new Error(passwordError(err, password));
  }
}

function passwordError(err: unknown, password?: string) {
  const rec = err as { name?: string; message?: string; code?: number };
  const msg = rec?.message || '';
  const name = rec?.name || '';
  const locked =
    name === 'PasswordException' ||
    rec?.code === 1 ||
    rec?.code === 2 ||
    /password/i.test(name) ||
    /password/i.test(msg);
  if (locked) {
    if (password) return 'Wrong PDF password, or the file is not a readable bank statement.';
    return 'This PDF is password-protected. Enter the statement password and try again.';
  }
  return `Could not open this PDF. Try downloading a fresh statement from your bank. ${msg}`.trim();
}

function itemsToLines(items: PdfItem[]): string {
  const rows: Array<{ y: number; x: number; str: string; width: number }> = [];
  for (const item of items) {
    const str = item.str ?? '';
    if (!str) continue;
    const tr = item.transform ?? [0, 0, 0, 0, 0, 0];
    rows.push({
      x: tr[4] ?? 0,
      y: Math.round((tr[5] ?? 0) * 10) / 10,
      str,
      width: item.width ?? str.length * 4,
    });
  }
  rows.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: string[] = [];
  let currentY = Number.POSITIVE_INFINITY;
  let buf: Array<{ x: number; str: string; width: number }> = [];
  const flush = () => {
    if (!buf.length) return;
    buf.sort((a, b) => a.x - b.x);
    lines.push(
      buf
        .map((p, i) => {
          const gap = i === 0 ? 0 : p.x - (buf[i - 1].x + buf[i - 1].width);
          return (gap > 1.2 ? ' ' : '') + p.str;
        })
        .join('')
        .replace(/\s+/g, ' ')
        .trim(),
    );
    buf = [];
  };
  for (const r of rows) {
    if (Math.abs(currentY - r.y) > 3) {
      flush();
      currentY = r.y;
    }
    buf.push(r);
  }
  flush();
  return lines.filter(Boolean).join('\n');
}
