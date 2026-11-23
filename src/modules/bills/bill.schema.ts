import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';

@Schema({ timestamps: true, toJSON: jsonTransform })
export class Bill {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Account' })
  accountId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  amountPaise: number;

  @Prop({ required: true, index: true })
  dueDate: Date;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  categoryId?: Types.ObjectId;

  @Prop({ default: 'upcoming', enum: ['upcoming', 'overdue', 'paid'] })
  status: string;

  @Prop({ default: 'monthly' })
  frequency?: string;

  @Prop()
  paidAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Transaction' })
  paidTransactionId?: Types.ObjectId;
}

export type BillDocument = HydratedDocument<Bill>;
export const BillSchema = SchemaFactory.createForClass(Bill);
BillSchema.index({ userId: 1, dueDate: 1 });
