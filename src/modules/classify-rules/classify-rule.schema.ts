import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AMOUNT_OPS, MATCH_MODES, RULE_DIRECTIONS } from '../../common/classify-rule';
import { jsonTransform } from '../../common/json';
import { TX_TYPES } from '../../common/types';

@Schema({ timestamps: true, toJSON: jsonTransform })
export class ClassifyRule {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ default: '', trim: true })
  pattern: string;

  @Prop({ default: 'contains', enum: MATCH_MODES })
  match: string;

  @Prop({ default: 'any', enum: RULE_DIRECTIONS })
  direction: string;

  @Prop({ required: true, enum: TX_TYPES })
  type: string;

  @Prop()
  categorySlug?: string;

  @Prop({ trim: true })
  merchant?: string;

  @Prop({ type: Types.ObjectId, ref: 'Account' })
  accountId?: Types.ObjectId;

  @Prop({ trim: true })
  bank?: string;

  @Prop({ default: 'any', enum: AMOUNT_OPS })
  amountOp: string;

  @Prop()
  amountPaise?: number;

  @Prop({ default: 0 })
  priority: number;

  @Prop({ default: true })
  isActive: boolean;
}

export type ClassifyRuleDocument = HydratedDocument<ClassifyRule>;
export const ClassifyRuleSchema = SchemaFactory.createForClass(ClassifyRule);
ClassifyRuleSchema.index({ userId: 1, priority: -1, createdAt: 1 });
