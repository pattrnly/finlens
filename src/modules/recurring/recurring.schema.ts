import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';

@Schema({ timestamps: true, toJSON: jsonTransform })
export class RecurringRule {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  amountPaise: number;

  @Prop({ default: 'expense' })
  type: string;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  categoryId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  subcategoryId?: Types.ObjectId;

  @Prop({ default: 'monthly', enum: ['once', 'weekly', 'monthly', 'quarterly', 'yearly'] })
  frequency: string;

  @Prop({ required: true })
  nextRun: Date;

  @Prop()
  endDate?: Date;

  @Prop()
  dayOfMonth?: number;

  @Prop({ default: true })
  autoCreate: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  merchant?: string;

  @Prop()
  note?: string;
}

export type RecurringRuleDocument = HydratedDocument<RecurringRule>;
export const RecurringRuleSchema = SchemaFactory.createForClass(RecurringRule);
RecurringRuleSchema.index({ userId: 1, nextRun: 1 });
