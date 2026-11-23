import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';

export const FAMILY_RELATIONS = ['self', 'spouse', 'parent', 'child', 'sibling', 'other'] as const;

@Schema({ timestamps: true, toJSON: jsonTransform })
export class FamilyMember {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: [String], default: [] })
  aliases: string[];

  @Prop({ default: 'other', enum: FAMILY_RELATIONS })
  relation: string;

  @Prop({ default: true })
  isActive: boolean;
}

export type FamilyMemberDocument = HydratedDocument<FamilyMember>;
export const FamilyMemberSchema = SchemaFactory.createForClass(FamilyMember);
FamilyMemberSchema.index({ userId: 1, name: 1 });
