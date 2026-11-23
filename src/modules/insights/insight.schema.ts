import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';

@Schema({ timestamps: true, toJSON: jsonTransform })
export class Insight {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop()
  question?: string;

  @Prop({ required: true })
  periodKey: string;

  @Prop({ required: true })
  narrative: string;

  @Prop({ type: Object, default: {} })
  stats: Record<string, unknown>;

  @Prop()
  expiresAt?: Date;
}

export type InsightDocument = HydratedDocument<Insight>;
export const InsightSchema = SchemaFactory.createForClass(Insight);
InsightSchema.index({ userId: 1, periodKey: 1, question: 1 });
