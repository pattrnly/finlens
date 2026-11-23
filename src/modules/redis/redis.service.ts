import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from './redis.constants';

export type RecogniseProgress = {
  status: 'running' | 'done' | 'error' | 'idle' | 'cancelled';
  phase?: string;
  label: string;
  done: number;
  total: number;
  percent: number;
  error?: string;
  statementId?: string;
  currentRow?: string;
  updatedAt?: string;
  runId?: string;
};

export class JobCancelledError extends Error {
  constructor(message = 'Stopped.') {
    super(message);
    this.name = 'JobCancelledError';
  }
}

@Injectable()
export class RedisService {
  private readonly log = new Logger(RedisService.name);
  private readonly recogniseMem = new Map<string, RecogniseProgress>();
  private readonly cancelMem = new Set<string>();

  constructor(@Inject(REDIS) private redis: Redis) {}

  recogniseKey(userId: string, statementId?: string) {
    return statementId ? `recognise:${userId}:${statementId}` : `recognise:${userId}`;
  }

  cancelKey(userId: string, statementId: string) {
    return `recognise:cancel:${userId}:${statementId}`;
  }

  async setRecogniseProgress(userId: string, value: Omit<RecogniseProgress, 'status'> & { status?: RecogniseProgress['status'] }) {
    const payload: RecogniseProgress = {
      status: value.status ?? 'running',
      phase: value.phase,
      label: value.label,
      done: value.done,
      total: value.total,
      percent: Math.max(0, Math.min(100, Math.round(value.percent))),
      error: value.error,
      statementId: value.statementId,
      currentRow: value.currentRow,
      updatedAt: value.updatedAt ?? new Date().toISOString(),
      runId: value.runId,
    };
    this.recogniseMem.set(userId, payload);
    await this.setJson(this.recogniseKey(userId), payload, 1800);
    if (payload.statementId) {
      this.recogniseMem.set(`${userId}:${payload.statementId}`, payload);
      await this.setJson(this.recogniseKey(userId, payload.statementId), payload, 1800);
    }
  }

  async getRecogniseProgress(userId: string, statementId?: string) {
    if (statementId) {
      return (
        (await this.getJson<RecogniseProgress>(this.recogniseKey(userId, statementId))) ??
        this.recogniseMem.get(`${userId}:${statementId}`) ??
        null
      );
    }
    return (await this.getJson<RecogniseProgress>(this.recogniseKey(userId))) ?? this.recogniseMem.get(userId) ?? null;
  }

  async requestCancel(userId: string, statementId: string) {
    const key = this.cancelKey(userId, statementId);
    this.cancelMem.add(key);
    try {
      await this.redis.set(key, '1', 'EX', 1800);
    } catch (err) {
      this.log.warn(`redis cancel failed: ${(err as Error).message}`);
    }
  }

  async isCancelled(userId: string, statementId: string) {
    const key = this.cancelKey(userId, statementId);
    if (this.cancelMem.has(key)) return true;
    try {
      return (await this.redis.get(key)) === '1';
    } catch {
      return false;
    }
  }

  async clearCancel(userId: string, statementId: string) {
    const key = this.cancelKey(userId, statementId);
    this.cancelMem.delete(key);
    try {
      await this.redis.del(key);
    } catch {
      /* ignore */
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSec = 600) {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSec);
    } catch (err) {
      this.log.warn(`redis set failed: ${(err as Error).message}`);
    }
  }

  async delPattern(pattern: string) {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length) await this.redis.del(...keys);
    } catch (err) {
      this.log.warn(`redis del failed: ${(err as Error).message}`);
    }
  }
}
