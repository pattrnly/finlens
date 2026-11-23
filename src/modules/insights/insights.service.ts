import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addHours } from 'date-fns';
import { Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { Insight, InsightDocument } from './insight.schema';

@Injectable()
export class InsightsService {
  constructor(
    @InjectModel(Insight.name) private model: Model<InsightDocument>,
    private analytics: AnalyticsService,
    private ai: AiService,
  ) {}

  async analyze(
    userId: string,
    question?: string,
    range = 'month',
    providerId?: string,
    from?: string,
    to?: string,
  ) {
    const periodKey = `${range}:${from ?? ''}:${to ?? ''}:${question ?? 'default'}:${providerId ?? 'auto'}`;
    const cached = await this.model.findOne({
      userId,
      periodKey,
      expiresAt: { $gt: new Date() },
    });
    if (cached) return cached;

    const stats = await this.analytics.summary(userId, range, from, to);
    let narrative: string;
    if (!(await this.ai.hasProvider(userId))) {
      narrative = fallbackNarrative(stats as Record<string, unknown>, question);
    } else {
      const json = await this.ai.generateJson<{ narrative: string }>(
        `You are FinLens, an India-first personal finance analyst.
Write a concise, practical narrative (max 180 words) in Indian English rupees context.
Income is salary plus non-family credits. Refunds and reversals are other credits, not salary. Own-account moves and UPI/IMPS from family members are transfers, excluded from income.
Do not invent numbers. Use only this JSON stats.
Question: ${question ?? 'What should I notice this period?'}
STATS: ${JSON.stringify(stats)}
Return JSON { "narrative": "..." }`,
        { userId, providerId },
      );
      narrative = json.narrative;
    }
    return this.model.create({
      userId: new Types.ObjectId(userId),
      question,
      periodKey,
      narrative,
      stats: stats as Record<string, unknown>,
      expiresAt: addHours(new Date(), 24),
    });
  }

  latest(userId: string) {
    return this.model.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(10).lean().exec();
  }
}

function fallbackNarrative(stats: Record<string, unknown>, question?: string) {
  const income = Number(stats.incomePaise ?? 0) / 100;
  const expense = Number(stats.expensePaise ?? 0) / 100;
  const net = Number(stats.netPaise ?? 0) / 100;
  const q = question ? ` (re: ${question})` : '';
  const credits = Number(stats.otherCreditPaise ?? 0) / 100;
  return `This period income was ₹${income.toLocaleString('en-IN')}, other credits (refunds/reversals) ₹${credits.toLocaleString('en-IN')}, spend ₹${expense.toLocaleString('en-IN')}, net ₹${net.toLocaleString('en-IN')}${q}. Add an AI service in Settings for a richer read. Family UPI and self transfers are not income.`;
}
