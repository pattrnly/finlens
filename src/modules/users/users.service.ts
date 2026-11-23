import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private users: Model<UserDocument>) {}

  findById(id: string) {
    return this.users.findById(id);
  }

  async updatePrefs(id: string, prefs: Record<string, unknown>) {
    return this.users.findByIdAndUpdate(
      id,
      { $set: Object.fromEntries(Object.entries(prefs).map(([k, v]) => [`prefs.${k}`, v])) },
      { new: true },
    );
  }
}
