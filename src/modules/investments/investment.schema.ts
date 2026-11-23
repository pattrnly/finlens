import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';

@Schema({ timestamps: true, toJSON: jsonTransform })
export class Investment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Account' })
  accountId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({
    required: true,
    enum: ['mutual_fund', 'sip', 'stock', 'fd', 'rd', 'ppf', 'epf', 'nps', 'gold', 'other'],
  })
  kind: string;

  @Prop()
  platform?: string;

  @Prop({ default: 0 })
  units: number;

  @Prop({ default: 0 })
  avgCostPaise: number;

  @Prop({ default: 0 })
  investedPaise: number;

  @Prop({ default: 0 })
  currentValuePaise: number;

  @Prop({ default: false })
  isSip: boolean;

  @Prop({ default: 0 })
  sipAmountPaise: number;

  @Prop()
  sipDate?: number;

  @Prop()
  folio?: string;
}

export type InvestmentDocument = HydratedDocument<Investment>;
export const InvestmentSchema = SchemaFactory.createForClass(Investment);

@Schema({ timestamps: true, toJSON: jsonTransform })
export class InvestmentLot {
  @Prop({ type: Types.ObjectId, ref: 'Investment', required: true, index: true })
  investmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true, enum: ['buy', 'sell', 'sip', 'dividend', 'interest'] })
  lotType: string;

  @Prop({ default: 0 })
  units: number;

  @Prop({ default: 0 })
  amountPaise: number;

  @Prop()
  note?: string;
}

export type InvestmentLotDocument = HydratedDocument<InvestmentLot>;
export const InvestmentLotSchema = SchemaFactory.createForClass(InvestmentLot);
