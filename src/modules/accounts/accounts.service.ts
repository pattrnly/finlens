import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ownedFilter } from '../../common/object-id';
import { Account, AccountDocument } from './account.schema';

@Injectable()
export class AccountsService {
  constructor(@InjectModel(Account.name) private model: Model<AccountDocument>) {}

  async list(userId: string) {
    return this.model
      .find({ userId: new Types.ObjectId(userId), isActive: { $ne: false } })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }

  async get(userId: string, id: string) {
    const doc = await this.model.findOne(ownedFilter(userId, id, 'Account'));
    if (!doc) throw new NotFoundException('Account not found');
    return doc;
  }

  create(userId: string, data: Partial<Account>) {
    return this.model.create({
      ...data,
      userId: new Types.ObjectId(userId),
      isActive: data.isActive ?? true,
    });
  }

  async update(userId: string, id: string, data: Partial<Account>) {
    const doc = await this.owned(userId, id);
    Object.assign(doc, data);
    await doc.save();
    return doc;
  }

  async remove(userId: string, id: string) {
    const doc = await this.owned(userId, id);
    doc.isActive = false;
    await doc.save();
    return { id: String(doc._id), deleted: true };
  }

  private async owned(userId: string, id: string) {
    const doc = await this.model.findOne(ownedFilter(userId, id, 'Account'));
    if (!doc) throw new NotFoundException('Account not found');
    return doc;
  }

  byLast4(userId: string, last4?: string) {
    if (!last4) return null;
    return this.model.findOne({ userId, last4, isActive: true });
  }
}
