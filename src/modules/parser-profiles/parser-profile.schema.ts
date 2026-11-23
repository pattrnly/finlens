import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';

@Schema({ _id: false })
export class ParserLayout {
  @Prop({ default: 'dd-MMM-yyyy' })
  dateFormat: string;

  @Prop({ default: 'asc', enum: ['asc', 'desc'] })
  sortOrder: string;

  @Prop({ type: [String], default: [] })
  skipRegexes: string[];

  @Prop({ default: true })
  wrapContinuesWithoutDate: boolean;

  @Prop({ default: 'debit_credit', enum: ['debit_credit', 'signed'] })
  amountMode: string;

  @Prop({ type: Object, default: {} })
  columnMap: Record<string, string>;
}

@Schema({ timestamps: true, toJSON: jsonTransform })
export class ParserProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
  userId?: Types.ObjectId;

  @Prop({ required: true })
  bankCode: string;

  @Prop({ required: true })
  bankName: string;

  @Prop({ type: [String], default: [] })
  fingerprints: string[];

  @Prop({ type: ParserLayout, default: () => ({}) })
  layout: ParserLayout;

  @Prop({ default: 'draft', enum: ['draft', 'stable', 'needs_repair'] })
  status: string;

  @Prop({ default: false })
  isBuiltin: boolean;
}

export type ParserProfileDocument = HydratedDocument<ParserProfile>;
export const ParserProfileSchema = SchemaFactory.createForClass(ParserProfile);
ParserProfileSchema.index({ bankCode: 1, userId: 1 });
