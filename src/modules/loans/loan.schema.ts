import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';

@Schema({ timestamps: true, toJSON: jsonTransform })
export class Loan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Account' })
  accountId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ default: 'personal' })
  loanType: string;

  @Prop()
  lender?: string;

  @Prop({ required: true })
  principalPaise: number;

  @Prop({ required: true })
  outstandingPaise: number;

  @Prop({ required: true })
  emiPaise: number;

  @Prop({ default: 0 })
  interestRateBps: number;

  @Prop({ default: 12 })
  tenureMonths: number;

  @Prop({ default: 12 })
  remainingMonths: number;

  @Prop()
  nextDue?: Date;

  @Prop({ default: 'active', enum: ['active', 'closed'] })
  status: string;
}

export type LoanDocument = HydratedDocument<Loan>;
export const LoanSchema = SchemaFactory.createForClass(Loan);
LoanSchema.index({ userId: 1, nextDue: 1 });
