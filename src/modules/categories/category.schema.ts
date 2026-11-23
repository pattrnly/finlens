import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';
import { CATEGORY_KINDS } from '../../common/types';

@Schema({ timestamps: true, toJSON: jsonTransform })
export class Category {
  @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
  userId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, index: true })
  slug: string;

  @Prop({ required: true, enum: CATEGORY_KINDS })
  kind: string;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: false })
  parentId?: Types.ObjectId;

  @Prop({ default: 'circle' })
  icon: string;

  @Prop({ default: '#14b8a6' })
  color: string;

  @Prop({ default: true })
  isSystem: boolean;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.index({ userId: 1, slug: 1 }, { unique: true, sparse: true });
CategorySchema.index({ isSystem: 1, slug: 1 }, { unique: true, partialFilterExpression: { isSystem: true } });
