import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';
import type { Impact, LoanStatus } from './types';

@Schema({ _id: false })
export class LoanLedgerDisbursement {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  date: string;
}

export const LoanLedgerDisbursementSchema = SchemaFactory.createForClass(LoanLedgerDisbursement);

@Schema({ _id: false })
export class LoanLedgerRateChange {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  annualRatePercent: number;

  @Prop({ required: true, enum: ['tenure', 'emi'] })
  impact: Impact;
}

export const LoanLedgerRateChangeSchema = SchemaFactory.createForClass(LoanLedgerRateChange);

@Schema({ _id: false })
export class LoanLedgerPartPayment {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true, enum: ['tenure', 'emi'] })
  impact: Impact;
}

export const LoanLedgerPartPaymentSchema = SchemaFactory.createForClass(LoanLedgerPartPayment);

@Schema({ timestamps: true, toJSON: jsonTransform, collection: 'loan_ledger' })
export class LoanLedger {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  emiStartDate: string;

  @Prop({ required: true })
  initialAnnualRatePercent: number;

  @Prop({ required: true })
  originalTenureMonths: number;

  @Prop({ required: true, enum: ['open', 'closed'], default: 'open' })
  status: LoanStatus;

  @Prop({ type: [LoanLedgerDisbursementSchema], default: [] })
  disbursements: LoanLedgerDisbursement[];

  @Prop({ type: [LoanLedgerRateChangeSchema], default: [] })
  rateChanges: LoanLedgerRateChange[];

  @Prop({ type: [LoanLedgerPartPaymentSchema], default: [] })
  partPayments: LoanLedgerPartPayment[];

  @Prop({ index: true })
  migratedFrom?: string;
}

export type LoanLedgerDocument = HydratedDocument<LoanLedger>;
export const LoanLedgerSchema = SchemaFactory.createForClass(LoanLedger);
LoanLedgerSchema.index({ userId: 1, migratedFrom: 1 });

@Schema({ timestamps: true, toJSON: jsonTransform, collection: 'loan_ledger_imports' })
export class LoanLedgerImport {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  key: string;
}

export type LoanLedgerImportDocument = HydratedDocument<LoanLedgerImport>;
export const LoanLedgerImportSchema = SchemaFactory.createForClass(LoanLedgerImport);
LoanLedgerImportSchema.index({ userId: 1, key: 1 }, { unique: true });
