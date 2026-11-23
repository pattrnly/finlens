import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';
import { ACCOUNT_TYPES } from '../../common/types';

@Schema({ timestamps: true, toJSON: jsonTransform })
export class Account {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: ACCOUNT_TYPES })
  type: string;

  @Prop({ default: 'INR' })
  currency: string;

  @Prop({ default: 0 })
  currentBalancePaise: number;

  @Prop({ trim: true })
  last4?: string;

  @Prop({ trim: true })
  bank?: string;

  @Prop({ uppercase: true, trim: true })
  ifscPrefix?: string;

  @Prop()
  billingCycleDay?: number;

  @Prop({ default: true })
  isActive: boolean;
}

export type AccountDocument = HydratedDocument<Account>;
export const AccountSchema = SchemaFactory.createForClass(Account);
AccountSchema.index({ userId: 1, last4: 1 });
