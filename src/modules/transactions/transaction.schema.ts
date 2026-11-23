import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';
import { CHANNELS, TX_TYPES } from '../../common/types';

@Schema({ timestamps: true, toJSON: jsonTransform })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Account', required: true, index: true })
  accountId: Types.ObjectId;

  @Prop({ required: true, enum: TX_TYPES })
  type: string;

  @Prop({ default: 'other', enum: CHANNELS })
  channel: string;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  amountPaise: number;

  @Prop()
  isCredit?: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  categoryId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  subcategoryId?: Types.ObjectId;

  @Prop()
  merchant?: string;

  @Prop()
  narration?: string;

  @Prop()
  upiRef?: string;

  @Prop()
  balanceAfterPaise?: number;

  @Prop({ default: 'manual', enum: ['manual', 'statement', 'recurring', 'emi'] })
  source: string;

  @Prop({ type: Types.ObjectId, ref: 'Statement' })
  statementId?: Types.ObjectId;

  @Prop({ required: true })
  fingerprint: string;

  @Prop({ type: Types.ObjectId, ref: 'Account' })
  counterpartyAccountId?: Types.ObjectId;

  @Prop({ default: false })
  excludedFromReports: boolean;

  @Prop()
  classifiedBy?: string;

  @Prop({ default: false })
  isDeleted: boolean;
}

export type TransactionDocument = HydratedDocument<Transaction>;
export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, fingerprint: 1 }, { unique: true });
