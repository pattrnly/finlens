import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addMonths } from 'date-fns';
import { Model, Types } from 'mongoose';
import { TransactionsService } from '../transactions/transactions.service';
import { Loan, LoanDocument } from './loan.schema';

@Injectable()
export class LoansService {
  constructor(
    @InjectModel(Loan.name) private model: Model<LoanDocument>,
    private txs: TransactionsService,
  ) {}

  list(userId: string) {
    return this.model.find({ userId: new Types.ObjectId(userId) }).sort({ nextDue: 1 }).lean().exec();
  }

  create(userId: string, data: Partial<Loan>) {
    return this.model.create({
      ...data,
      userId: new Types.ObjectId(userId),
      outstandingPaise: data.outstandingPaise ?? data.principalPaise ?? 0,
      remainingMonths: data.remainingMonths ?? data.tenureMonths ?? 0,
    });
  }

  async update(userId: string, id: string, data: Partial<Loan>) {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, userId: new Types.ObjectId(userId) },
      data,
      { new: true },
    );
    if (!doc) throw new NotFoundException('Loan not found');
    return doc;
  }

  async payEmi(userId: string, id: string, accountId: string) {
    const loan = await this.model.findOne({ _id: id, userId: new Types.ObjectId(userId) });
    if (!loan) throw new NotFoundException('Loan not found');
    const tx = await this.txs.create(userId, {
      accountId,
      type: 'emi',
      date: new Date(),
      amountPaise: loan.emiPaise,
      merchant: loan.lender ?? loan.name,
      narration: `EMI: ${loan.name}`,
      source: 'emi',
    });
    loan.outstandingPaise = Math.max(0, loan.outstandingPaise - loan.emiPaise);
    loan.remainingMonths = Math.max(0, loan.remainingMonths - 1);
    loan.nextDue = loan.nextDue ? addMonths(loan.nextDue, 1) : addMonths(new Date(), 1);
    if (loan.remainingMonths === 0 || loan.outstandingPaise === 0) loan.status = 'closed';
    await loan.save();
    return { loan, transaction: tx };
  }
}
