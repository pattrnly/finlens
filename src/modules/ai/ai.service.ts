import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { decryptSecret, encryptSecret, keyHint } from '../../common/secret';
import { coerceTxType } from '../../common/types';
import { ownedFilter } from '../../common/object-id';
import { parseLlmJson } from '../../common/parse-llm-json';
import { JobCancelledError } from '../redis/redis.service';
import { AI_CATALOG, catalogEntry } from './ai.catalog';
import { AiProvider, AiProviderDocument } from './ai-provider.schema';

export type ClassifyHint = {
  i: number;
  narration: string;
  debitPaise: number;
  creditPaise: number;
  merchant?: string;
  type?: string;
  categorySlug?: string;
};

export type ClassifyAiRow = {
  i: number;
  type: string;
  merchant: string;
  categorySlug: string;
  subcategorySlug?: string;
  isTransfer: boolean;
};

type CallResult = { text: string; providerName: string; providerId: string };

type PublicProvider = {
  id: string;
  name: string;
  kind: string;
  model: string;
  baseUrl?: string;
  isDefault: boolean;
  isEnabled: boolean;
  keyHint: string;
  lastError?: string;
  lastOkAt?: Date;
  readOnly: boolean;
};

@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);

  constructor(
    @InjectModel(AiProvider.name) private model: Model<AiProviderDocument>,
    private config: ConfigService,
  ) {}

  catalog() {
    return AI_CATALOG;
  }

  secret() {
    return this.config.get<string>('JWT_SECRET', 'finlens-dev-secret-change-me');
  }

  async list(userId: string) {
    const docs = await this.model.find({ userId: new Types.ObjectId(userId) }).sort({ isDefault: -1, order: 1, name: 1 }).lean();
    const items: PublicProvider[] = docs.map((d) => this.publicProvider(d));
    if (this.envGeminiKey()) {
      items.push({
        id: 'env-gemini',
        name: 'Server Gemini',
        kind: 'gemini',
        model: this.config.get<string>('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
        isDefault: items.every((p) => !p.isDefault),
        isEnabled: true,
        keyHint: 'env',
        readOnly: true,
      });
    }
    return items;
  }

  async create(
    userId: string,
    data: { name: string; kind: string; model?: string; baseUrl?: string; apiKey: string; isDefault?: boolean },
  ) {
    if (!data.apiKey?.trim()) throw new BadRequestException('API key is required');
    const cat = catalogEntry(data.kind);
    if (!cat) throw new BadRequestException('Unknown AI service');
    const count = await this.model.countDocuments({ userId: new Types.ObjectId(userId) });
    const isDefault = data.isDefault ?? count === 0;
    if (isDefault) {
      await this.model.updateMany({ userId: new Types.ObjectId(userId) }, { $set: { isDefault: false } });
    }
    const doc = await this.model.create({
      userId: new Types.ObjectId(userId),
      name: data.name.trim(),
      kind: data.kind,
      modelName: data.model?.trim() || cat.defaultModel,
      baseUrl: data.baseUrl?.trim() || cat.defaultBaseUrl,
      apiKeyEnc: encryptSecret(data.apiKey.trim(), this.secret()),
      keyHint: keyHint(data.apiKey),
      isDefault,
      isEnabled: true,
      order: count,
    });
    return this.publicProvider(doc);
  }

  async update(
    userId: string,
    id: string,
    data: Partial<{
      name: string;
      kind: string;
      model: string;
      baseUrl: string;
      apiKey: string;
      isEnabled: boolean;
      isDefault: boolean;
    }>,
  ) {
    const doc = await this.model.findOne(ownedFilter(userId, id, 'AI service'));
    if (!doc) throw new NotFoundException('AI service not found');
    if (data.kind != null) {
      const cat = catalogEntry(data.kind);
      if (!cat) throw new BadRequestException('Unknown AI service');
      doc.kind = data.kind;
    }
    if (data.name != null) doc.name = data.name.trim();
    if (data.model != null) doc.modelName = data.model.trim();
    if (data.baseUrl !== undefined) doc.baseUrl = data.baseUrl.trim() || undefined;
    if (data.apiKey?.trim()) {
      doc.apiKeyEnc = encryptSecret(data.apiKey.trim(), this.secret());
      doc.keyHint = keyHint(data.apiKey);
    }
    if (data.apiKey?.trim() || data.model != null || data.kind != null || data.baseUrl !== undefined) {
      doc.lastError = undefined;
      doc.disabledUntil = undefined;
    }
    if (data.isEnabled != null) doc.isEnabled = data.isEnabled;
    if (data.isDefault) {
      await this.model.updateMany({ userId: doc.userId }, { $set: { isDefault: false } });
      doc.isDefault = true;
    }
    await doc.save();
    return this.publicProvider(doc);
  }

  async remove(userId: string, id: string) {
    const doc = await this.model.findOne(ownedFilter(userId, id, 'AI service'));
    if (!doc) throw new NotFoundException('AI service not found');
    const wasDefault = doc.isDefault;
    await doc.deleteOne();
    if (wasDefault) {
      const next = await this.model.findOne({ userId: new Types.ObjectId(userId), isEnabled: true });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }
    return { id, deleted: true };
  }

  async setDefault(userId: string, id: string) {
    return this.update(userId, id, { isDefault: true });
  }

  async test(userId: string, id: string) {
    const started = Date.now();
    const item = await this.itemFor(userId, id);
    if (!item) throw new NotFoundException('AI service not found');
    try {
      const result = await this.callProvider(item, 'Return JSON {"ok":true} and nothing else.');
      if (!result.text.trim()) throw new Error('Empty response');
      const parsed = parseLlmJson<{ ok?: boolean }>(result.text);
      if (item.doc) {
        item.doc.lastOkAt = new Date();
        item.doc.lastError = undefined;
        item.doc.disabledUntil = undefined;
        if (item.doc.modelName !== item.model) item.doc.modelName = item.model;
        await item.doc.save();
      }
      this.lastUsed = { id: result.providerId, name: result.providerName };
      return { ok: parsed.ok !== false, latencyMs: Date.now() - started, used: this.lastUsed, model: item.model };
    } catch (err) {
      const message = friendlyAiError(item.kind, err);
      this.log.warn(`AI test ${item.name} failed: ${message}${errorCause(err)}`);
      if (item.doc) {
        item.doc.lastError = message.slice(0, 240);
        await item.doc.save();
      }
      throw new BadRequestException(message);
    }
  }

  lastUsed?: { id: string; name: string };

  async hasProvider(userId?: string) {
    if (this.envGeminiKey()) return true;
    if (!userId) return false;
    const n = await this.model.countDocuments({
      userId: new Types.ObjectId(userId),
      isEnabled: true,
    });
    return n > 0;
  }

  /** @deprecated use hasProvider */
  hasKey() {
    return Boolean(this.envGeminiKey());
  }

  async generateJson<T>(prompt: string, opts: { userId?: string; providerId?: string } = {}): Promise<T> {
    const queue = await this.queue(opts.userId, opts.providerId);
    if (!queue.length) {
      throw new ServiceUnavailableException({
        code: 'NEEDS_AI_KEY',
        message: 'Add an AI service in Settings to recognise transactions and write insights.',
      });
    }
    let lastErr: Error | undefined;
    for (const item of queue) {
      try {
        const result = await this.callProvider(item, prompt);
        if (!result.text.trim()) throw new Error('Empty response');
        const parsed = parseLlmJson<T>(result.text);
        this.lastUsed = { id: result.providerId, name: result.providerName };
        if (item.doc) {
          item.doc.lastOkAt = new Date();
          item.doc.lastError = undefined;
          item.doc.disabledUntil = undefined;
          await item.doc.save();
        }
        return parsed;
      } catch (err) {
        lastErr = err as Error;
        this.log.warn(`AI ${item.name} failed: ${String(err)}`);
        if (item.doc) {
          item.doc.lastError = String((err as Error).message).slice(0, 240);
          if (isFailoverError(err)) {
            item.doc.disabledUntil = new Date(Date.now() + 15 * 60 * 1000);
          }
          await item.doc.save();
        }
      }
    }
    throw new ServiceUnavailableException(
      lastErr?.message || 'All AI services failed or hit their limit. Try another key in Settings.',
    );
  }

  async classifyRows(
    userId: string,
    rows: ClassifyHint[],
    slugs: Array<{ slug: string; name: string; parent?: string }>,
    providerId?: string,
    familyNames: string[] = [],
    onProgress?: (
      done: number,
      total: number,
      info?: { waitingFrom?: number; waitingTo?: number },
    ) => void | Promise<void>,
    shouldAbort?: () => boolean | Promise<boolean>,
  ): Promise<{ rows: ClassifyAiRow[]; used?: { id: string; name: string } }> {
    if (!rows.length) return { rows: [] };
    const out: ClassifyAiRow[] = [];
    const size = 20;
    const total = rows.length;
    await onProgress?.(0, total);
    for (let i = 0; i < rows.length; i += size) {
      if (await shouldAbort?.()) {
        throw new JobCancelledError();
      }
      const chunk = rows.slice(i, i + size);
      await onProgress?.(i, total, { waitingFrom: i + 1, waitingTo: Math.min(i + size, total) });
      const json = await this.generateJson<{ rows: ClassifyAiRow[] }>(
        classifyPrompt(chunk, slugs, familyNames),
        {
        userId,
        providerId,
      },
      );
      for (const row of json.rows ?? []) {
        const type = coerceTxType(row.type);
        out.push({
          i: row.i,
          type,
          merchant: row.merchant,
          categorySlug: row.categorySlug,
          subcategorySlug: row.subcategorySlug,
          isTransfer: Boolean(row.isTransfer) || type === 'transfer',
        });
      }
      await onProgress?.(Math.min(i + size, total), total);
    }
    return { rows: out, used: this.lastUsed };
  }

  private envGeminiKey() {
    return this.config.get<string>('GEMINI_API_KEY')?.trim() || '';
  }

  private publicProvider(d: {
    id?: unknown;
    _id?: unknown;
    name?: string;
    kind?: string;
    modelName?: string;
    baseUrl?: string;
    isDefault?: boolean;
    isEnabled?: boolean;
    keyHint?: string;
    lastError?: string;
    lastOkAt?: Date;
  }): PublicProvider {
    return {
      id: String(d.id ?? d._id),
      name: String(d.name ?? ''),
      kind: String(d.kind ?? ''),
      model: resolveModel(String(d.kind ?? ''), String(d.modelName ?? '')),
      baseUrl: d.baseUrl,
      isDefault: Boolean(d.isDefault),
      isEnabled: d.isEnabled !== false,
      keyHint: d.keyHint ?? '••••',
      lastError: d.lastError,
      lastOkAt: d.lastOkAt,
      readOnly: false,
    };
  }

  private async itemFor(userId: string, id: string) {
    const queue = await this.queue(userId, id, true);
    return queue.find((q) => q.id === id);
  }

  private async queue(userId?: string, preferredId?: string, includeDisabled = false) {
    const items: Array<{
      id: string;
      name: string;
      kind: string;
      model: string;
      baseUrl?: string;
      apiKey: string;
      doc?: AiProviderDocument;
    }> = [];
    if (userId) {
      const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
      if (!includeDisabled) filter.isEnabled = true;
      const docs = await this.model.find(filter).sort({ isDefault: -1, order: 1 });
      const now = Date.now();
      const ready = docs.filter((d) => !d.disabledUntil || d.disabledUntil.getTime() <= now);
      const cooling = docs.filter((d) => d.disabledUntil && d.disabledUntil.getTime() > now);
      const ordered = [...ready, ...cooling];
      if (preferredId && preferredId !== 'env-gemini') {
        ordered.sort((a, b) => Number(String(b._id) === preferredId) - Number(String(a._id) === preferredId));
      }
      for (const d of ordered) {
        try {
          items.push({
            id: String(d._id),
            name: d.name,
            kind: d.kind,
            model: resolveModel(d.kind, d.modelName),
            baseUrl: d.baseUrl,
            apiKey: decryptSecret(d.apiKeyEnc, this.secret()),
            doc: d,
          });
        } catch {
          this.log.warn(`Could not decrypt key for ${d.name}`);
        }
      }
    }
    const envKey = this.envGeminiKey();
    if (envKey && preferredId !== undefined && preferredId !== 'env-gemini' && items.length) {
      items.push({
        id: 'env-gemini',
        name: 'Server Gemini',
        kind: 'gemini',
        model: this.config.get<string>('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
        apiKey: envKey,
      });
    } else if (envKey) {
      const envItem = {
        id: 'env-gemini',
        name: 'Server Gemini',
        kind: 'gemini',
        model: this.config.get<string>('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
        apiKey: envKey,
      };
      if (preferredId === 'env-gemini' || !items.length) items.unshift(envItem);
      else items.push(envItem);
    }
    return items;
  }

  private async callProvider(
    item: { id: string; name: string; kind: string; model: string; baseUrl?: string; apiKey: string },
    prompt: string,
  ): Promise<CallResult> {
    if (item.kind === 'gemini') {
      const text = await this.callGemini(item.apiKey, item.model, prompt);
      return { text, providerName: item.name, providerId: item.id };
    }
    if (item.kind === 'anthropic') {
      const text = await this.callAnthropic(item.apiKey, item.model, item.baseUrl, prompt);
      return { text, providerName: item.name, providerId: item.id };
    }
    const text = await this.callOpenAiCompat(item.apiKey, item.model, item.baseUrl, item.kind, prompt);
    return { text, providerName: item.name, providerId: item.id };
  }

  private async callGemini(apiKey: string, model: string, prompt: string) {
    const requested = resolveModel('gemini', model).replace(/^models\//, '');
    const models = [...new Set([requested, 'gemini-3.5-flash-lite'])];
    let lastErr: Error | undefined;
    for (const id of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent`;
      try {
        const text = await this.callGeminiModel(url, apiKey, prompt);
        if (id !== requested) this.log.warn(`Gemini ${requested} unavailable; used ${id}`);
        return text;
      } catch (err) {
        lastErr = err as Error;
        if (!isGeminiFallback(err)) throw err;
        this.log.warn(`Gemini ${id} busy: ${lastErr.message}`);
      }
    }
    throw lastErr ?? new Error('Empty response');
  }

  private async callGeminiModel(url: string, apiKey: string, prompt: string) {
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];
    const payloads: Record<string, unknown>[] = [
      {
        contents,
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingLevel: 'LOW' },
        },
      },
      {
        contents,
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      { contents, generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 } },
    ];
    let lastErr: Error | undefined;
    for (const payload of payloads) {
      try {
        return await postGemini(url, apiKey, payload);
      } catch (err) {
        lastErr = err as Error;
        const msg = String((err as Error).message);
        if (!/400|422|INVALID_ARGUMENT|does not support|unknown name|thinking/i.test(msg)) throw err;
      }
    }
    throw lastErr ?? new Error('Empty response');
  }

  private async callOpenAiCompat(apiKey: string, model: string, baseUrl: string | undefined, kind: string, prompt: string) {
    const url = chatCompletionsUrl(baseUrl, kind);
    const resolved = resolveModel(kind, model);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (kind === 'openrouter') {
      headers['HTTP-Referer'] = 'https://finlens.app';
      headers['X-Title'] = 'FinLens';
    }
    const messages = [
      { role: 'system', content: 'Reply with valid JSON only.' },
      { role: 'user', content: prompt },
    ];
    const timeoutMs = kind === 'grok' ? 90_000 : 25_000;
    const payloads: Record<string, unknown>[] = [
      kind === 'grok'
        ? {
            model: resolved,
            max_completion_tokens: 4096,
            reasoning_effort: 'none',
            response_format: { type: 'json_object' },
            messages,
          }
        : {
            model: resolved,
            temperature: 0,
            max_tokens: 4096,
            response_format: { type: 'json_object' },
            messages,
          },
      { model: resolved, messages },
    ];
    let lastErr: Error | undefined;
    for (const payload of payloads) {
      try {
        return await postChatCompletion(url, headers, payload, timeoutMs);
      } catch (err) {
        lastErr = err as Error;
        const msg = String((err as Error).message);
        if (!/400|422|does not support|unsupported|unknown parameter/i.test(msg)) throw err;
      }
    }
    throw lastErr ?? new Error('Empty response');
  }

  private async callAnthropic(apiKey: string, model: string, baseUrl: string | undefined, prompt: string) {
    const root = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    const res = await fetch(`${root}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0,
        system: 'Reply with valid JSON only. No markdown.',
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    const { body } = await readJsonBody(res);
    if (!res.ok) throw new Error(openaiError(res.status, body));
    const rec = body as { content?: Array<{ text?: string }> };
    return rec.content?.[0]?.text ?? '';
  }
}

function resolveModel(kind: string, model: string) {
  if (kind === 'grok') return GROK_MODEL_ALIAS[model] ?? model;
  if (kind === 'gemini') return GEMINI_MODEL_ALIAS[model] ?? model;
  return model;
}

const GEMINI_MODEL_ALIAS: Record<string, string> = {
  'gemini-2.0-flash': 'gemini-3.5-flash-lite',
  'gemini-2.0-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-1.5-flash': 'gemini-3.5-flash-lite',
  'gemini-1.5-pro': 'gemini-3.5-flash-lite',
  'gemini-pro': 'gemini-3.5-flash-lite',
  'gemini-2.5-flash': 'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
};

const GROK_MODEL_ALIAS: Record<string, string> = {
  'grok-4-fast': 'grok-4.3',
  'grok-4-fast-reasoning': 'grok-4.3',
  'grok-4-fast-non-reasoning': 'grok-4.3',
  'grok-4-1-fast-reasoning': 'grok-4.3',
  'grok-4-1-fast-non-reasoning': 'grok-4.3',
  'grok-3': 'grok-4.3',
  'grok-3-mini': 'grok-4.3',
  'grok-4': 'grok-4.3',
};

function chatCompletionsUrl(baseUrl: string | undefined, kind: string) {
  const cat = catalogEntry(kind);
  let root = (baseUrl || cat?.defaultBaseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  if (root.endsWith('/chat/completions')) return root;
  if (!/\/v\d+$/i.test(root) && !root.includes('/api/v1')) root = `${root}/v1`;
  return `${root}/chat/completions`;
}

async function postChatCompletion(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
  timeoutMs: number,
) {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const { body } = await readJsonBody(res);
  if (!res.ok) throw new Error(openaiError(res.status, body));
  const rec = body as { choices?: Array<{ message?: { content?: string } }> };
  return rec.choices?.[0]?.message?.content ?? '';
}

async function readJsonBody(res: Response) {
  const raw = await res.text();
  if (!raw) return { body: {}, raw };
  try {
    return { body: JSON.parse(raw) as unknown, raw };
  } catch {
    return { body: { message: raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) }, raw };
  }
}

async function postGemini(url: string, apiKey: string, payload: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    throw new Error(networkError(err));
  }
  const { body } = await readJsonBody(res);
  if (!res.ok) throw new Error(geminiError(res.status, body));
  const rec = body as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  const text = rec.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim() && rec.promptFeedback?.blockReason) {
    throw new Error(`Blocked by Gemini (${rec.promptFeedback.blockReason})`);
  }
  return text;
}

function geminiError(status: number, body: unknown) {
  const rec = body as { error?: { message?: string; status?: string; code?: number } };
  const msg = rec?.error?.message || `HTTP ${status}`;
  const code = rec?.error?.status ? ` (${rec.error.status})` : '';
  return `${status} ${msg}${code}`.trim();
}

function networkError(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  const cause = errorCause(err).replace(/^ · /, '');
  if (/timeout|aborted/i.test(raw)) return 'Timed out reaching Gemini. Try gemini-3.5-flash-lite, or retry in a minute.';
  return `Could not reach Gemini (${cause || raw}). Windows often hangs on IPv6 — retry, or check DNS/firewall.`;
}

function errorCause(err: unknown) {
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
  if (!cause) return '';
  return ` · ${cause.code ?? cause.message ?? String(cause)}`;
}

function isGeminiFallback(err: unknown) {
  const msg = String(err).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('no longer available') ||
    msg.includes('not_found') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('aborted')
  );
}

function openaiError(status: number, body: unknown) {
  const rec = body as { error?: { message?: string } | string; message?: string; code?: string };
  const fromObj = typeof rec?.error === 'object' && rec.error ? rec.error.message : undefined;
  const fromStr = typeof rec?.error === 'string' ? rec.error : undefined;
  const msg = fromObj || fromStr || rec?.message || `HTTP ${status}`;
  const code = rec?.code ? ` (${rec.code})` : '';
  return `${status} ${msg}${code}`.trim();
}

function friendlyAiError(kind: string, err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('401') || lower.includes('incorrect api key') || lower.includes('invalid_api_key')) {
    return kind === 'grok'
      ? 'xAI rejected this API key (401). Paste a key from console.x.ai that starts with xai-.'
      : `${catalogEntry(kind)?.name ?? 'AI'} rejected this API key (401). Create a new key and save it again.`;
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand')) {
    return kind === 'gemini'
      ? 'Gemini is busy (high demand). Retry, or edit the model to gemini-3.5-flash-lite.'
      : `${catalogEntry(kind)?.name ?? 'AI'} is temporarily unavailable (${raw}).`;
  }
  if (lower.includes('403')) {
    return kind === 'grok'
      ? 'xAI refused this key (403): it has no inference permission, the team is blocked, or credits are empty. Check console.x.ai.'
      : `${catalogEntry(kind)?.name ?? 'AI'} returned 403 (key, billing, or region blocked). ${raw}`;
  }
  if (lower.includes('timeout') || lower.includes('aborted') || lower.includes('timed out')) {
    return `${catalogEntry(kind)?.name ?? 'AI'} timed out. Try again, or use a faster model.`;
  }
  if (
    lower.includes('fetch failed') ||
    lower.includes('could not reach') ||
    lower.includes('enotfound') ||
    lower.includes('econnreset') ||
    lower.includes('und_err')
  ) {
    return `${catalogEntry(kind)?.name ?? 'AI'} could not be reached (${raw}). Check internet, DNS, or firewall.`;
  }
  if (lower.includes('429') || lower.includes('quota') || lower.includes('rate')) {
    return `${catalogEntry(kind)?.name ?? 'AI'} hit its rate limit. FinLens will switch to another service when more than one key is saved.`;
  }
  if (
    err instanceof SyntaxError ||
    raw.startsWith('Unexpected token') ||
    lower.includes('is not valid json') ||
    lower.includes('double-quoted property name')
  ) {
    return `${catalogEntry(kind)?.name ?? 'AI'} returned incomplete JSON. Try Recognise again.`;
  }
  return raw;
}

function isFailoverError(err: unknown) {
  const msg = String(err).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('timeout') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('500') ||
    msg.includes('empty response') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed')
  );
}

function classifyPrompt(
  rows: ClassifyHint[],
  slugs: Array<{ slug: string; name: string; parent?: string }>,
  familyNames: string[] = [],
) {
  const familyRule = familyNames.length
    ? `- UPI/IMPS credits or debits that mention these family names, surnames, or UPI handles — full or partial, e.g. "sonal" matches SONALBEN, "utsav" matches utsavhi — are type "transfer", isTransfer true, never income: ${JSON.stringify(familyNames)}\n`
    : '';
  return `You classify Indian bank statement rows for FinLens, a personal finance app.
Rules:
- Own-account, UPI to self, last4 of own account, "own a/c" are type "transfer". Never income.
${familyRule}- Salary / payroll is type "income".
- Refund is "refund". Reversal is "reversal". Interest credit is "interest".
- Other UPI/IMPS credits (people or merchants who are not family) are type "income", never transfer.
- Other UPI/IMPS debits that are not family or self are type "expense".
- Debits are usually "expense" unless EMI, investment, transfer, or loan part payment. Bank charges are expense, never "fee".
- Loan installments, ACH D- HDFC BANK, EHDF, NACH/ECS EMI, and "HDFC LTD" debits are type "emi", not expense.
- Extra loan principal, part payment, prepayment, or foreclosure (not the regular EMI) is type "part_payment". Never expense, income, or emi.
- Allowed types: expense, income, transfer, investment, refund, reversal, emi, interest, part_payment.
Pick categorySlug (and subcategorySlug when it is a child) only from this list:
${JSON.stringify(slugs)}
Return only valid JSON with double-quoted keys and no trailing commas: {"rows":[{"i":0,"type":"expense","merchant":"...","categorySlug":"...","subcategorySlug":"","isTransfer":false}]}
ROWS:
${JSON.stringify(rows)}`;
}
