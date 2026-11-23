import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';

export const AI_KINDS = ['gemini', 'openai', 'grok', 'anthropic', 'openrouter', 'custom'] as const;
export type AiKind = (typeof AI_KINDS)[number];

@Schema({ timestamps: true, toJSON: jsonTransform })
export class AiProvider {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: AI_KINDS })
  kind: string;

  @Prop({ required: true })
  modelName: string;

  @Prop()
  baseUrl?: string;

  @Prop({ required: true })
  apiKeyEnc: string;

  @Prop()
  keyHint?: string;

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ default: true })
  isEnabled: boolean;

  @Prop({ default: 0 })
  order: number;

  @Prop()
  lastError?: string;

  @Prop()
  lastOkAt?: Date;

  @Prop()
  disabledUntil?: Date;
}

export type AiProviderDocument = HydratedDocument<AiProvider>;
export const AiProviderSchema = SchemaFactory.createForClass(AiProvider);
AiProviderSchema.index({ userId: 1, kind: 1 });
