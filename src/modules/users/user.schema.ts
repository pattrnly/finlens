import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { jsonTransform } from '../../common/json';

@Schema({ _id: false })
export class UserPrefs {
  @Prop({ default: 4 })
  fyStartMonth: number;

  @Prop({ default: 'dark' })
  theme: string;

  @Prop({ type: Types.ObjectId, required: false })
  defaultAccountId?: Types.ObjectId;

  @Prop({ default: 'Asia/Kolkata' })
  timezone: string;
}

@Schema({ timestamps: true, toJSON: jsonTransform })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop()
  passwordHash?: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  googleId?: string;

  @Prop({ type: UserPrefs, default: () => ({}) })
  prefs: UserPrefs;

  @Prop()
  refreshTokenHash?: string;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
