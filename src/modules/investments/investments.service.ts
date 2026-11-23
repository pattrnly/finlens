import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ownedFilter } from '../../common/object-id';
import {
  Investment,
  InvestmentDocument,
  InvestmentLot,
  InvestmentLotDocument,
} from './investment.schema';

@Injectable()
export class InvestmentsService {
  constructor(
    @InjectModel(Investment.name) private model: Model<InvestmentDocument>,
    @InjectModel(InvestmentLot.name) private lots: Model<InvestmentLotDocument>,
  ) {}

  list(userId: string) {
    return this.model.find({ userId: new Types.ObjectId(userId) }).sort({ name: 1 }).lean().exec();
  }

  create(userId: string, data: Partial<Investment>) {
    return this.model.create({ ...data, userId: new Types.ObjectId(userId) });
  }

  async update(userId: string, id: string, data: Partial<Investment>) {
    const doc = await this.model.findOneAndUpdate(
      ownedFilter(userId, id, 'Investment'),
      data,
      { returnDocument: 'after' },
    );
    if (!doc) throw new NotFoundException('Investment not found');
    return doc;
  }

  async addLot(
    userId: string,
    investmentId: string,
    data: { date: Date; lotType: string; units: number; amountPaise: number; note?: string },
  ) {
    const inv = await this.model.findOne({
      _id: investmentId,
      userId: new Types.ObjectId(userId),
    });
    if (!inv) throw new NotFoundException('Investment not found');
    const lot = await this.lots.create({
      ...data,
      investmentId: inv._id,
      userId: new Types.ObjectId(userId),
    });
    if (data.lotType === 'buy' || data.lotType === 'sip') {
      inv.units += data.units;
      inv.investedPaise += data.amountPaise;
      inv.avgCostPaise = inv.units ? Math.round(inv.investedPaise / inv.units) : 0;
      if (!inv.currentValuePaise) inv.currentValuePaise = inv.investedPaise;
    } else if (data.lotType === 'sell') {
      inv.units = Math.max(0, inv.units - data.units);
      inv.investedPaise = Math.max(0, inv.investedPaise - data.amountPaise);
    }
    await inv.save();
    return { investment: inv, lot };
  }

  lotsFor(userId: string, investmentId: string) {
    return this.lots
      .find({
        userId: new Types.ObjectId(userId),
        investmentId: new Types.ObjectId(investmentId),
      })
      .sort({ date: -1 })
      .lean()
      .exec();
  }

  async remove(userId: string, id: string) {
    const doc = await this.model.findOne(ownedFilter(userId, id, 'Investment'));
    if (!doc) throw new NotFoundException('Investment not found');
    await this.lots.deleteMany({ investmentId: doc._id, userId: doc.userId });
    await doc.deleteOne();
    return { id: String(doc._id), deleted: true };
  }

  async summary(userId: string) {
    const items = await this.model.find({ userId: new Types.ObjectId(userId) });
    const invested = items.reduce((s, i) => s + i.investedPaise, 0);
    const current = items.reduce((s, i) => s + i.currentValuePaise, 0);
    return {
      investedPaise: invested,
      currentValuePaise: current,
      pnlPaise: current - invested,
      allocation: items.map((i) => ({
        id: String(i._id),
        name: i.name,
        kind: i.kind,
        valuePaise: i.currentValuePaise,
        weight: current ? i.currentValuePaise / current : 0,
      })),
    };
  }
}
