import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';

@Schema({ timestamps: true, toJSON: jsonTransform })
export class Statement {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Account' })
  accountId?: Types.ObjectId;

  @Prop()
  originalName?: string;

  @Prop()
  storedPath?: string;

  @Prop()
  pdfPassword?: string;

  @Prop()
  bankCode?: string;

  @Prop()
  bankName?: string;

  @Prop()
  accountLast4?: string;

  @Prop()
  ifsc?: string;

  @Prop()
  periodFrom?: Date;

  @Prop()
  periodTo?: Date;

  @Prop({ default: 0 })
  openingBalancePaise: number;

  @Prop({ default: 0 })
  closingBalancePaise: number;

  @Prop({ default: 0 })
  totalDebitPaise: number;

  @Prop({ default: 0 })
  totalCreditPaise: number;

  @Prop({
    default: 'queued',
    enum: ['queued', 'processing', 'needs_review', 'committed', 'failed', 'needs_ai_key'],
  })
  status: string;

  @Prop()
  error?: string;

  @Prop({ default: false })
  reconMatched: boolean;

  @Prop({ default: 0 })
  reconDeltaPaise: number;

  @Prop({ default: 0 })
  rowCount: number;

  @Prop({ default: 'builtin' })
  parseMethod: string;

  @Prop()
  classifyMethod?: string;

  @Prop()
  classifyProvider?: string;

  @Prop({ type: Object })
  progress?: {
    status?: string;
    phase?: string;
    label?: string;
    done?: number;
    total?: number;
    percent?: number;
    currentRow?: string;
    error?: string;
    statementId?: string;
    updatedAt?: string;
  };
}

export type StatementDocument = HydratedDocument<Statement>;
export const StatementSchema = SchemaFactory.createForClass(Statement);

@Schema({ timestamps: true, toJSON: jsonTransform })
export class StatementRow {
  @Prop({ type: Types.ObjectId, ref: 'Statement', required: true, index: true })
  statementId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop()
  valueDate?: Date;

  @Prop({ default: '' })
  narration: string;

  @Prop({ default: 0 })
  debitPaise: number;

  @Prop({ default: 0 })
  creditPaise: number;

  @Prop()
  balanceAfterPaise?: number;

  @Prop()
  upiRef?: string;

  @Prop()
  merchant?: string;

  @Prop()
  type?: string;

  @Prop()
  channel?: string;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  categoryId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  subcategoryId?: Types.ObjectId;

  @Prop({ default: 0.5 })
  confidence: number;

  @Prop({ default: false })
  isDuplicate: boolean;

  @Prop({ default: false })
  isInternalTransfer: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Account' })
  counterpartyAccountId?: Types.ObjectId;

  @Prop({ default: false })
  accepted: boolean;

  @Prop({ default: false })
  excludedFromSpend: boolean;

  @Prop()
  fingerprint?: string;

  @Prop({ default: 'rules' })
  classifiedBy?: string;
}

export type StatementRowDocument = HydratedDocument<StatementRow>;
export const StatementRowSchema = SchemaFactory.createForClass(StatementRow);
