import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { objectId } from '../../common/object-id';
import { computeLoan } from './amortization';
import { isIsoDate, todayIso } from './dates';
import {
  LoanLedger,
  LoanLedgerDocument,
  LoanLedgerImport,
  LoanLedgerImportDocument,
} from './loan-ledger.schema';
import { LOANLENS_IMPORT_KEY, LOANLENS_IMPORTED_LOANS } from './loan-ledger.seed';
import { stripSchedules, summarizePortfolio } from './portfolio';
import type { Impact, Loan, LoanStatus, PartPayment, RateChange } from './types';

type LedgerLean = LoanLedger & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

export type LoanWrite = {
  name: string;
  emiStartDate: string;
  initialAnnualRatePercent: number;
  originalTenureMonths: number;
  status?: LoanStatus;
  disbursements: Array<{ id?: string; amount: number; date: string }>;
  rateChanges?: Array<{ id?: string; date: string; annualRatePercent: number; impact: Impact }>;
  partPayments?: Array<{ id?: string; amount: number; date: string; impact: Impact }>;
};

@Injectable()
export class LoanLedgerService {
  constructor(
    @InjectModel(LoanLedger.name) private loans: Model<LoanLedgerDocument>,
    @InjectModel(LoanLedgerImport.name) private imports: Model<LoanLedgerImportDocument>,
  ) {}

  async portfolio(userId: string, asOf?: string) {
    const date = this.resolveAsOf(asOf);
    const loans = await this.listLoans(userId);
    const summary = summarizePortfolio(loans, date);
    return {
      asOf: date,
      loanCount: summary.loanCount,
      activeCount: summary.activeCount,
      principal: summary.principal,
      outstanding: summary.outstanding,
      remainingPrincipal: summary.remainingPrincipal,
      remainingTenureMonths: summary.remainingTenureMonths,
      remainingEmiAmount: summary.remainingEmiAmount,
      remainingInterest: summary.remainingInterest,
      views: summary.views.map((view) => ({
        loan: view.loan,
        isActive: view.isActive,
        computation: stripSchedules(view.computation),
      })),
    };
  }

  async get(userId: string, id: string, asOf?: string) {
    await this.ensureImported(userId);
    const doc = await this.loans.findOne({ _id: objectId(id, 'Loan'), userId: objectId(userId) }).lean().exec();
    if (!doc) throw new NotFoundException('Loan not found');
    const loan = this.toLoan(doc as LedgerLean);
    const date = this.resolveAsOf(asOf);
    return { asOf: date, loan, computation: computeLoan(loan, date) };
  }

  async create(userId: string, data: LoanWrite) {
    const doc = await this.loans.create({
      userId: objectId(userId),
      name: data.name.trim(),
      emiStartDate: data.emiStartDate,
      initialAnnualRatePercent: data.initialAnnualRatePercent,
      originalTenureMonths: Math.round(data.originalTenureMonths),
      status: data.status ?? 'open',
      disbursements: this.normalizeDisbursements(data.disbursements),
      rateChanges: this.normalizeRateChanges(data.rateChanges ?? []),
      partPayments: this.normalizePartPayments(data.partPayments ?? []),
    });
    const loan = this.toLoan(doc.toObject() as LedgerLean);
    const asOf = todayIso();
    return { asOf, loan, computation: computeLoan(loan, asOf) };
  }

  async update(userId: string, id: string, data: Partial<LoanWrite>) {
    const existing = await this.loans.findOne({ _id: objectId(id, 'Loan'), userId: objectId(userId) });
    if (!existing) throw new NotFoundException('Loan not found');
    if (data.name != null) existing.name = data.name.trim();
    if (data.emiStartDate != null) existing.emiStartDate = data.emiStartDate;
    if (data.initialAnnualRatePercent != null) existing.initialAnnualRatePercent = data.initialAnnualRatePercent;
    if (data.originalTenureMonths != null) existing.originalTenureMonths = Math.round(data.originalTenureMonths);
    if (data.status != null) existing.status = data.status;
    if (data.disbursements != null) existing.disbursements = this.normalizeDisbursements(data.disbursements);
    if (data.rateChanges != null) existing.rateChanges = this.normalizeRateChanges(data.rateChanges);
    if (data.partPayments != null) existing.partPayments = this.normalizePartPayments(data.partPayments);
    await existing.save();
    const loan = this.toLoan(existing.toObject() as LedgerLean);
    const asOf = todayIso();
    return { asOf, loan, computation: computeLoan(loan, asOf) };
  }

  async remove(userId: string, id: string) {
    const doc = await this.loans.findOneAndDelete({
      _id: objectId(id, 'Loan'),
      userId: objectId(userId),
    });
    if (!doc) throw new NotFoundException('Loan not found');
    return { ok: true };
  }

  async addRateChange(userId: string, id: string, change: Omit<RateChange, 'id'> & { id?: string }) {
    const existing = await this.requireLoan(userId, id);
    existing.rateChanges.push({
      id: change.id || randomUUID(),
      date: change.date,
      annualRatePercent: change.annualRatePercent,
      impact: change.impact,
    });
    await existing.save();
    return this.detailFromDoc(existing);
  }

  async removeRateChange(userId: string, id: string, eventId: string) {
    const existing = await this.requireLoan(userId, id);
    existing.rateChanges = existing.rateChanges.filter((item) => item.id !== eventId);
    await existing.save();
    return this.detailFromDoc(existing);
  }

  async addPartPayment(userId: string, id: string, payment: Omit<PartPayment, 'id'> & { id?: string }) {
    const existing = await this.requireLoan(userId, id);
    existing.partPayments.push({
      id: payment.id || randomUUID(),
      date: payment.date,
      amount: payment.amount,
      impact: payment.impact,
    });
    await existing.save();
    return this.detailFromDoc(existing);
  }

  async removePartPayment(userId: string, id: string, eventId: string) {
    const existing = await this.requireLoan(userId, id);
    existing.partPayments = existing.partPayments.filter((item) => item.id !== eventId);
    await existing.save();
    return this.detailFromDoc(existing);
  }

  private async listLoans(userId: string): Promise<Loan[]> {
    await this.ensureImported(userId);
    const docs = await this.loans.find({ userId: objectId(userId) }).sort({ name: 1 }).lean().exec();
    return docs.map((doc) => this.toLoan(doc as LedgerLean));
  }

  private async ensureImported(userId: string) {
    const uid = objectId(userId);
    const seededLoan = await this.loans.exists({ userId: uid, migratedFrom: LOANLENS_IMPORT_KEY });
    if (seededLoan) {
      await this.markImported(uid);
      return;
    }
    const already = await this.imports.findOne({ userId: uid, key: LOANLENS_IMPORT_KEY }).lean().exec();
    if (already) return;
    try {
      await this.loans.insertMany(
        LOANLENS_IMPORTED_LOANS.map((loan) => ({
          userId: uid,
          name: loan.name,
          emiStartDate: loan.emiStartDate,
          initialAnnualRatePercent: loan.initialAnnualRatePercent,
          originalTenureMonths: loan.originalTenureMonths,
          status: loan.status,
          disbursements: loan.disbursements,
          rateChanges: loan.rateChanges,
          partPayments: loan.partPayments,
          migratedFrom: LOANLENS_IMPORT_KEY,
          createdAt: new Date(loan.createdAt),
          updatedAt: new Date(loan.updatedAt),
        })),
      );
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
    await this.markImported(uid);
  }

  private async markImported(userId: Types.ObjectId) {
    await this.imports.updateOne(
      { userId, key: LOANLENS_IMPORT_KEY },
      { $setOnInsert: { userId, key: LOANLENS_IMPORT_KEY } },
      { upsert: true },
    );
  }

  private async requireLoan(userId: string, id: string) {
    const existing = await this.loans.findOne({ _id: objectId(id, 'Loan'), userId: objectId(userId) });
    if (!existing) throw new NotFoundException('Loan not found');
    return existing;
  }

  private detailFromDoc(doc: LoanLedgerDocument) {
    const loan = this.toLoan(doc.toObject() as LedgerLean);
    const asOf = todayIso();
    return { asOf, loan, computation: computeLoan(loan, asOf) };
  }

  private resolveAsOf(asOf?: string) {
    return isIsoDate(asOf) ? asOf : todayIso();
  }

  private normalizeDisbursements(items: LoanWrite['disbursements']) {
    return items
      .filter((item) => item.amount > 0 && item.date)
      .map((item) => ({
        id: item.id || randomUUID(),
        amount: item.amount,
        date: item.date,
      }));
  }

  private normalizeRateChanges(items: NonNullable<LoanWrite['rateChanges']>) {
    return items.map((item) => ({
      id: item.id || randomUUID(),
      date: item.date,
      annualRatePercent: item.annualRatePercent,
      impact: item.impact,
    }));
  }

  private normalizePartPayments(items: NonNullable<LoanWrite['partPayments']>) {
    return items
      .filter((item) => item.amount > 0 && item.date)
      .map((item) => ({
        id: item.id || randomUUID(),
        amount: item.amount,
        date: item.date,
        impact: item.impact,
      }));
  }

  private toLoan(doc: LedgerLean): Loan {
    return {
      id: String(doc._id),
      name: doc.name,
      emiStartDate: doc.emiStartDate,
      initialAnnualRatePercent: doc.initialAnnualRatePercent,
      originalTenureMonths: doc.originalTenureMonths,
      status: doc.status,
      disbursements: (doc.disbursements ?? []).map((item) => ({
        id: item.id,
        amount: item.amount,
        date: item.date,
      })),
      rateChanges: (doc.rateChanges ?? []).map((item) => ({
        id: item.id,
        date: item.date,
        annualRatePercent: item.annualRatePercent,
        impact: item.impact,
      })),
      partPayments: (doc.partPayments ?? []).map((item) => ({
        id: item.id,
        amount: item.amount,
        date: item.date,
        impact: item.impact,
      })),
      createdAt: this.toIso(doc.createdAt),
      updatedAt: this.toIso(doc.updatedAt),
    };
  }

  private toIso(value?: Date | string) {
    if (!value) return new Date().toISOString();
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }
}
