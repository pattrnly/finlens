import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';

@Schema({ timestamps: true, toJSON: jsonTransform })
export class Merchant {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  normalizedPayee: string;

  @Prop()
  displayName?: string;

  @Prop()
  channel?: string;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  categoryId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  subcategoryId?: Types.ObjectId;

  @Prop()
  type?: string;

  @Prop({ default: 'seed', enum: ['seed', 'user', 'committed'] })
  source: string;
}

export type MerchantDocument = HydratedDocument<Merchant>;
export const MerchantSchema = SchemaFactory.createForClass(Merchant);
MerchantSchema.index({ userId: 1, normalizedPayee: 1 }, { unique: true });
