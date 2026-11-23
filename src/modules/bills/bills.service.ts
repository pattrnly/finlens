import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addMonths } from 'date-fns';
import { Model, Types } from 'mongoose';
import { TransactionsService } from '../transactions/transactions.service';
import { Bill, BillDocument } from './bill.schema';

@Injectable()
export class BillsService {
  constructor(
    @InjectModel(Bill.name) private model: Model<BillDocument>,
    private txs: TransactionsService,
  ) {}

  list(userId: string) {
    return this.model.find({ userId: new Types.ObjectId(userId) }).sort({ dueDate: 1 }).lean().exec();
  }

  upcoming(userId: string) {
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    return this.model.find({
      userId: new Types.ObjectId(userId),
      status: { $in: ['upcoming', 'overdue'] },
      dueDate: { $lte: soon },
    }).lean().exec();
  }

  create(userId: string, data: Partial<Bill>) {
    return this.model.create({ ...data, userId: new Types.ObjectId(userId) });
  }

  async update(userId: string, id: string, data: Partial<Bill>) {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, userId: new Types.ObjectId(userId) },
      data,
      { new: true },
    );
    if (!doc) throw new NotFoundException('Bill not found');
    return doc;
  }

  async markPaid(userId: string, id: string, accountId: string) {
    const bill = await this.model.findOne({ _id: id, userId: new Types.ObjectId(userId) });
    if (!bill) throw new NotFoundException('Bill not found');
    const tx = await this.txs.create(userId, {
      accountId,
      type: 'expense',
      date: new Date(),
      amountPaise: bill.amountPaise,
      categoryId: bill.categoryId,
      merchant: bill.name,
      narration: `Bill: ${bill.name}`,
    });
    bill.status = 'paid';
    bill.paidAt = new Date();
    bill.paidTransactionId = tx._id as Types.ObjectId;
    if (bill.frequency === 'monthly') {
      const next = await this.model.create({
        userId: bill.userId,
        accountId: bill.accountId,
        name: bill.name,
        amountPaise: bill.amountPaise,
        dueDate: addMonths(bill.dueDate, 1),
        categoryId: bill.categoryId,
        frequency: 'monthly',
        status: 'upcoming',
      });
      await bill.save();
      return { bill, next, transaction: tx };
    }
    await bill.save();
    return { bill, transaction: tx };
  }
}
