import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AsyncLocalStorage } from 'async_hooks';
import { basename } from 'path';
import { Model, Types } from 'mongoose';
import { isoDate, statementMonthLabel } from '../../common/dates';
import { extractUpiRrn, fingerprint, normalizeNarration } from '../../common/fingerprint';
import { isDuplicateKeyError } from '../../common/mongo-error';
import { rupeesToPaise } from '../../common/money';
import { Account, AccountDocument } from '../accounts/account.schema';
import { AiService } from '../ai/ai.service';
import { ClassifyRulesService } from '../classify-rules/classify-rules.service';
import { FamilyService } from '../family/family.service';
import { familySearchText } from '../../common/family-match';
import { coerceTxType } from '../../common/types';
import { Category, CategoryDocument } from '../categories/category.schema';
import { JobCancelledError, RedisService, type RecogniseProgress } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { isLocalStoredPath } from '../storage/storage.util';
import { TransactionsService } from '../transactions/transactions.service';
import { Merchant, MerchantDocument } from '../merchants/merchant.schema';
import {
  ParserProfile,
  ParserProfileDocument,
} from '../parser-profiles/parser-profile.schema';
import { Transaction, TransactionDocument } from '../transactions/transaction.schema';
import { classifyRow, finalizeRecognisedType, idsFromSlug, reconcile } from './classify';
import { detectBank } from './parsers/detect-bank';
import { parseAuBank } from './parsers/au-bank.parser';
import { parseHdfc } from './parsers/hdfc.parser';
import { parseIdfcFirst } from './parsers/idfc-first.parser';
import { parseIndusind } from './parsers/indusind.parser';
import { parseSbi } from './parsers/sbi.parser';
import type { ExtractedHeader, ExtractedRow, ParseResult } from './parsers/types';
import { extractPdfText, unlockPdf } from './pdf-text';
import { Statement, StatementDocument, StatementRow, StatementRowDocument } from './statement.schema';

@Injectable()
export class StatementsService implements OnModuleInit {
  private readonly log = new Logger(StatementsService.name);

  constructor(
    @InjectModel(Statement.name) private statements: Model<StatementDocument>,
    @InjectModel(StatementRow.name) private rows: Model<StatementRowDocument>,
    @InjectModel(Account.name) private accounts: Model<AccountDocument>,
    @InjectModel(Category.name) private categories: Model<CategoryDocument>,
    @InjectModel(Merchant.name) private merchants: Model<MerchantDocument>,
    @InjectModel(ParserProfile.name) private profiles: Model<ParserProfileDocument>,
    @InjectModel(Transaction.name) private txs: Model<TransactionDocument>,
    private ledger: TransactionsService,
    private ai: AiService,
    private family: FamilyService,
    private classifyRules: ClassifyRulesService,
    private cache: RedisService,
    private storage: StorageService,
  ) {}

  private readonly runs = new Map<string, string>();
  private readonly runAls = new AsyncLocalStorage<string>();

  async onModuleInit() {
    const builtins = [
      {
        bankCode: 'idfc_first',
        bankName: 'IDFC First Bank',
        fingerprints: ['IDFC FIRST', 'IDFB', 'idfcfirstbank'],
        layout: {
          dateFormat: 'dd-MMM-yyyy',
          sortOrder: 'asc',
          wrapContinuesWithoutDate: true,
          amountMode: 'debit_credit',
          skipRegexes: ['REGISTERED OFFICE', 'IMPORTANT MESSAGE'],
        },
      },
      {
        bankCode: 'au_bank',
        bankName: 'AU Small Finance Bank',
        fingerprints: ['AUBL', 'au.bank.in', 'aubank'],
        layout: {
          dateFormat: 'd MMM yyyy',
          sortOrder: 'desc',
          wrapContinuesWithoutDate: true,
          amountMode: 'debit_credit',
          skipRegexes: ['auto generated statement', 'www.au.bank'],
        },
      },
      {
        bankCode: 'hdfc',
        bankName: 'HDFC Bank',
        fingerprints: ['HDFC BANK', 'HDFC000', 'Withdrawal Amt.'],
        layout: {
          dateFormat: 'dd/MM/yy',
          sortOrder: 'asc',
          wrapContinuesWithoutDate: true,
          amountMode: 'debit_credit',
          skipRegexes: ['HDFC BANK LIMITED', 'STATEMENT SUMMARY'],
        },
      },
      {
        bankCode: 'indusind',
        bankName: 'IndusInd Bank',
        fingerprints: ['IndusInd', 'INDB', 'reachus@indusind', 'indusind.com'],
        layout: {
          dateFormat: 'd-MMM-yyyy',
          sortOrder: 'asc',
          wrapContinuesWithoutDate: true,
          amountMode: 'debit_credit',
          skipRegexes: ['INDUSIND BANK LTD', 'computer generated statement'],
        },
      },
      {
        bankCode: 'sbi',
        bankName: 'State Bank of India',
        fingerprints: ['STATE BANK OF INDIA', 'SBIN', 'sbi.co.in'],
        layout: {
          dateFormat: 'dd/MM/yyyy',
          sortOrder: 'asc',
          wrapContinuesWithoutDate: true,
          amountMode: 'debit_credit',
          skipRegexes: ['computer generated statement', 'Page no.'],
        },
      },
    ];
    for (const p of builtins) {
      await this.profiles.updateOne(
        { bankCode: p.bankCode, isBuiltin: true },
        { $setOnInsert: { ...p, status: 'stable', isBuiltin: true } },
        { upsert: true },
      );
    }
    await this.migrateLocalPdfsToS3();
  }

  private async migrateLocalPdfsToS3() {
    const docs = await this.statements
      .find({ storedPath: { $exists: true, $nin: [null, ''] } })
      .select('userId storedPath')
      .exec();
    let moved = 0;
    for (const doc of docs) {
      if (!doc.storedPath || !isLocalStoredPath(doc.storedPath)) continue;
      try {
        doc.storedPath = await this.storage.migrateLocalPdf(String(doc.userId), doc.storedPath);
        await doc.save();
        moved += 1;
      } catch (err) {
        this.log.error(`Could not move statement ${String(doc._id)} to S3: ${String(err)}`);
      }
    }
    if (moved) this.log.log(`Moved ${moved} statement PDF${moved === 1 ? '' : 's'} to S3`);
  }

  async list(userId: string) {
    const docs = await this.statements
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();
    await this.fillMissingPeriods(userId, docs);
    const ids = docs.map((d) => d._id);
    const booked = ids.length
      ? await this.txs.aggregate<{ _id: Types.ObjectId; n: number }>([
          {
            $match: {
              userId: new Types.ObjectId(userId),
              statementId: { $in: ids },
              isDeleted: false,
            },
          },
          { $group: { _id: '$statementId', n: { $sum: 1 } } },
        ])
      : [];
    const bookedById = new Map(booked.map((b) => [String(b._id), b.n]));
    const lives = await Promise.all(docs.map((d) => this.cache.getRecogniseProgress(userId, String(d._id))));
    const out = [];
    for (let i = 0; i < docs.length; i++) {
      const d = docs[i];
      const progress = await this.resolveProgress(userId, d, lives[i]);
      out.push(this.publicStatement({ ...d, progress }, bookedById.get(String(d._id)) ?? 0));
    }
    return out;
  }

  async get(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Statement not found');
    const doc = await this.statements
      .findOne({ _id: id, userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Statement not found');
    const rows = await this.rows
      .find({
        statementId: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .sort({ date: 1 })
      .lean()
      .exec();
    if ((!doc.periodFrom || !doc.periodTo) && rows.length) {
      if (!doc.periodFrom) doc.periodFrom = rows[0].date;
      if (!doc.periodTo) doc.periodTo = rows[rows.length - 1].date;
    }
    const bookedCount = await this.txs.countDocuments({
      userId: new Types.ObjectId(userId),
      statementId: new Types.ObjectId(id),
      isDeleted: false,
    });
    const live = await this.cache.getRecogniseProgress(userId, id);
    const progress = await this.resolveProgress(userId, doc, live);
    return { statement: this.publicStatement({ ...doc, progress }, bookedCount), rows };
  }

  async originalPdf(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Statement not found');
    const doc = await this.statements
      .findOne({ _id: id, userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Statement not found');
    if (!doc.storedPath) throw new NotFoundException('Original PDF is not available');
    const buffer = await this.storage.getPdf(doc.storedPath);
    const original = doc.originalName?.trim() || basename(doc.storedPath);
    const filename = original.toLowerCase().endsWith('.pdf') ? original : `${original}.pdf`;
    return { buffer, filename };
  }

  async upload(
    userId: string,
    file: { filename: string; buffer: Buffer },
    opts: { accountId?: string; password?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Please choose a PDF file to upload.');
    }
    const stored = this.storage.objectKey(userId, file.filename);
    await this.storage.putPdf(stored, file.buffer);
    const stmt = await this.statements.create({
      userId: new Types.ObjectId(userId),
      accountId: opts.accountId ? new Types.ObjectId(opts.accountId) : undefined,
      originalName: file.filename,
      storedPath: stored,
      pdfPassword: opts.password || undefined,
      status: 'queued',
    });
    try {
      await this.process(String(stmt._id), opts.password);
    } catch (err) {
      this.log.error(err);
    }
    const fresh = await this.statements.findById(stmt._id).lean();
    if (fresh?.status === 'failed') {
      throw new BadRequestException(fresh.error || 'Could not parse this statement PDF.');
    }
    return this.publicStatement(fresh!);
  }

  async process(statementId: string, password?: string) {
    const stmt = await this.statements.findById(statementId);
    if (!stmt || !stmt.storedPath) throw new NotFoundException('Statement not found');
    const storedPath = stmt.storedPath;
    if (password) stmt.pdfPassword = password;
    stmt.status = 'processing';
    await this.saveIgnoringProgress(stmt);
    const uid = String(stmt.userId);
    const runId = this.beginRun(statementId);
    return this.runAls.run(runId, async () => {
    await this.cache.clearCancel(uid, statementId);
    try {
      await this.markProgress(uid, statementId, {
        phase: 'parse',
        label: 'Reading PDF…',
        done: 0,
        total: 0,
        percent: 6,
      });
      const raw = await this.storage.getPdf(storedPath);
      const unlocked = await unlockPdf(raw, password);
      const text = await extractPdfText(unlocked, password);
      await this.throwIfCancelled(uid, statementId);
      const detected = detectBank(text);
      stmt.bankCode = detected.code;
      stmt.bankName = detected.name;

      let parsed = parseKnownLayout(detected.code, text);
      if (!parsed?.rows.length) {
        const fallback = parseKnownLayoutFallback(detected.code, text);
        if (fallback?.rows.length) {
          parsed = fallback;
          stmt.bankCode = fallback.header.bankCode;
          stmt.bankName = fallback.header.bankName;
        }
      }

      const profile = await this.profiles.findOne({
        bankCode: detected.code,
        status: 'stable',
        $or: [{ userId: stmt.userId }, { isBuiltin: true }, { userId: { $exists: false } }],
      });

      if (!parsed && profile) {
        parsed = applyProfile(text, profile, detected);
      }

      if (!parsed) {
        if (!(await this.ai.hasProvider(String(stmt.userId)))) {
          stmt.status = 'needs_ai_key';
          stmt.error = 'Unknown bank layout. Add an AI service in Settings to extract this statement.';
          await this.saveIgnoringProgress(stmt);
          await this.markProgress(uid, statementId, {
            status: 'error',
            phase: 'parse',
            label: stmt.error,
            done: 0,
            total: 0,
            percent: 100,
            error: stmt.error,
          });
          return stmt;
        }
        await this.throwIfCancelled(uid, statementId);
        await this.markProgress(uid, statementId, {
          phase: 'parse',
          label: 'Asking AI to extract rows from this PDF…',
          done: 0,
          total: 0,
          percent: 12,
        });
        parsed = await this.inferWithAi(text, String(stmt.userId), detected);
        stmt.parseMethod = 'ai_draft';
      } else {
        stmt.parseMethod = parsed.method;
      }

      await this.throwIfCancelled(uid, statementId);
      await this.markProgress(uid, statementId, {
        phase: 'parse',
        label: `Found ${parsed.rows.length} rows in the PDF`,
        done: 0,
        total: parsed.rows.length,
        percent: 18,
      });
      this.applyHeader(stmt, parsed.header);
      if (!parsed.rows.length) {
        throw new BadRequestException(
          'Could not find any transactions in this PDF. Try a full account statement (not a mini statement), or enter the PDF password if it is locked.',
        );
      }
      if (!stmt.accountId) {
        const acc = await this.matchAccount(stmt.userId, parsed.header);
        if (acc) stmt.accountId = acc._id as Types.ObjectId;
      }

      const recon = reconcile(
        parsed.header.openingBalancePaise,
        parsed.rows,
        parsed.header.closingBalancePaise,
      );
      stmt.reconMatched = recon.matched;
      stmt.reconDeltaPaise = recon.delta;
      stmt.rowCount = parsed.rows.length;

      const accounts = await this.accounts.find({
        userId: stmt.userId,
        isActive: { $ne: false },
      });
      const last4s = accounts.map((a) => a.last4).filter(Boolean) as string[];
      const learned = await this.merchants.find({ userId: stmt.userId });
      const cats = await this.categories.find({
        $or: [{ isSystem: true }, { userId: stmt.userId }],
      });
      const catById = new Map(cats.map((c) => [String(c._id), c]));
      const family = await this.family.hints(String(stmt.userId));
      const rules = await this.classifyRules.hints(String(stmt.userId));

      await this.rows.deleteMany({ statementId: stmt._id });
      await this.markProgress(uid, statementId, {
        phase: 'rules',
        label: `Matching merchants · 0 of ${parsed.rows.length} rows`,
        done: 0,
        total: parsed.rows.length,
        percent: 22,
      });
      const docs = [];
      const acc = accounts.find((a) => String(a._id) === String(stmt.accountId));
      for (let i = 0; i < parsed.rows.length; i++) {
        await this.throwIfCancelled(uid, statementId);
        const row = parsed.rows[i];
        if (i === 0 || (i + 1) % 3 === 0 || i === parsed.rows.length - 1) {
          await this.markProgress(uid, statementId, {
            phase: 'rules',
            label: `Matching row ${i + 1} of ${parsed.rows.length}`,
            done: i + 1,
            total: parsed.rows.length,
            percent: 22 + ((i + 1) / Math.max(parsed.rows.length, 1)) * 18,
            currentRow: (row.narration || '').slice(0, 80),
          });
        }
        const classified = classifyRow(
          row,
          learned.map((m) => {
            const sub = m.subcategoryId ? catById.get(String(m.subcategoryId)) : undefined;
            const parent = m.categoryId ? catById.get(String(m.categoryId)) : undefined;
            return {
              normalizedPayee: m.normalizedPayee,
              type: m.type,
              categorySlug: sub?.slug ?? parent?.slug,
              displayName: m.displayName,
            };
          }),
          last4s,
          family,
          rules,
          {
            accountId: stmt.accountId ? String(stmt.accountId) : undefined,
            bank: acc?.bank || stmt.bankName,
          },
        );
        const amount = classified.debitPaise || classified.creditPaise;
        const fp = fingerprint({
          userId: String(stmt.userId),
          accountLast4: acc?.last4 ?? stmt.accountLast4 ?? 'xxxx',
          date: isoDate(classified.date),
          amountPaise: amount,
          ref: classified.upiRef || classified.narration,
          balanceAfterPaise: classified.balanceAfterPaise,
        });
        const dup = await this.txs.findOne({
          userId: stmt.userId,
          fingerprint: fp,
          isDeleted: { $ne: true },
        });
        const counterparty = this.findCounterparty(classified, accounts, stmt.accountId);
        const ids = idsFromSlug(classified.categorySlug, cats);
        docs.push({
          statementId: stmt._id,
          userId: stmt.userId,
          date: classified.date,
          valueDate: classified.valueDate,
          narration: classified.narration,
          debitPaise: classified.debitPaise,
          creditPaise: classified.creditPaise,
          balanceAfterPaise: classified.balanceAfterPaise,
          upiRef: classified.upiRef,
          merchant: classified.merchant,
          type: classified.type,
          channel: classified.channel,
          categoryId: ids.categoryId,
          subcategoryId: ids.subcategoryId,
          confidence: classified.confidence,
          isDuplicate: Boolean(dup),
          isInternalTransfer: Boolean(counterparty) || classified.type === 'transfer',
          counterpartyAccountId: counterparty?._id,
          excludedFromSpend: classified.excludedFromSpend || Boolean(counterparty),
          fingerprint: fp,
          classifiedBy: classified.classifiedBy ?? 'rules',
        });
      }
      if (docs.length) await this.rows.insertMany(docs);
      stmt.status = 'needs_review';
      stmt.classifyMethod = 'rules';
      await this.saveIgnoringProgress(stmt);
      if (await this.ai.hasProvider(String(stmt.userId))) {
        try {
          await this.recognise(String(stmt.userId), String(stmt._id));
        } catch (err) {
          if (isJobCancelled(err)) {
            await this.markCancelled(uid, statementId, parsed.rows.length);
          } else {
            this.log.warn(`AI classify skipped: ${String(err)}`);
            await this.markProgress(uid, statementId, {
              status: 'done',
              phase: 'rules',
              label: `Parsed ${parsed.rows.length} rows with rules`,
              done: parsed.rows.length,
              total: parsed.rows.length,
              percent: 100,
            });
          }
        }
      } else {
        await this.markProgress(uid, statementId, {
          status: 'done',
          phase: 'rules',
          label: `Parsed ${parsed.rows.length} rows with rules`,
          done: parsed.rows.length,
          total: parsed.rows.length,
          percent: 100,
        });
      }
      return this.statements.findById(stmt._id);
    } catch (err) {
      if (isJobCancelled(err)) {
        const fresh = await this.statements.findById(stmt._id);
        const total = fresh?.rowCount ?? 0;
        if (fresh && fresh.status === 'processing') {
          fresh.status = total ? 'needs_review' : 'queued';
          await this.saveIgnoringProgress(fresh);
        }
        await this.markCancelled(uid, statementId, total);
        return this.statements.findById(stmt._id);
      }
      this.log.error(err);
      stmt.status = 'failed';
      stmt.error = (err as Error).message;
      await this.saveIgnoringProgress(stmt);
      await this.markProgress(uid, statementId, {
        status: 'error',
        phase: 'parse',
        label: 'Could not parse this statement',
        done: 0,
        total: 0,
        percent: 100,
        error: (err as Error).message,
      });
      throw err;
    }
    });
  }

  async patchRow(
    userId: string,
    statementId: string,
    rowId: string,
    patch: Record<string, unknown>,
  ) {
    const row = await this.rows.findOneAndUpdate(
      {
        _id: rowId,
        statementId: new Types.ObjectId(statementId),
        userId: new Types.ObjectId(userId),
      },
      patch,
      { returnDocument: 'after' },
    );
    if (!row) throw new NotFoundException('Row not found');
    row.classifiedBy = 'user';
    if (patch.type === 'transfer' || patch.isInternalTransfer) {
      row.excludedFromSpend = true;
      row.isInternalTransfer = true;
    }
    await row.save();
    if (row.merchant) {
      await this.merchants.updateOne(
        { userId: row.userId, normalizedPayee: normalizeNarration(row.merchant) },
        {
          $set: {
            displayName: row.merchant,
            type: row.type,
            categoryId: row.categoryId,
            subcategoryId: row.subcategoryId,
            channel: row.channel,
            source: 'user',
          },
        },
        { upsert: true },
      );
    }
    return row;
  }

  async commit(
    userId: string,
    statementId: string,
    body: { rowIds?: string[]; acceptHighConfidence?: boolean; accountId?: string },
  ) {
    const stmt = await this.statements.findOne({
      _id: statementId,
      userId: new Types.ObjectId(userId),
    });
    if (!stmt) throw new NotFoundException('Statement not found');
    if (body.accountId) {
      const acc = await this.accounts.findOne({
        _id: body.accountId,
        userId: stmt.userId,
        isActive: { $ne: false },
      });
      if (!acc) throw new BadRequestException('Choose a valid account to book these transactions.');
      stmt.accountId = acc._id as Types.ObjectId;
      const patch: Record<string, unknown> = {};
      if (!acc.last4 && stmt.accountLast4) patch.last4 = stmt.accountLast4;
      if (!acc.bank && stmt.bankName) patch.bank = stmt.bankName;
      if (!acc.ifscPrefix && stmt.ifsc) patch.ifscPrefix = stmt.ifsc.slice(0, 4);
      if (Object.keys(patch).length) await this.accounts.updateOne({ _id: acc._id }, { $set: patch });
    }
    if (!stmt.accountId) {
      throw new BadRequestException(
        'Select which account this statement belongs to before committing.',
      );
    }
    const filter: Record<string, unknown> = {
      statementId: stmt._id,
      userId: stmt.userId,
      accepted: { $ne: true },
    };
    if (body.rowIds?.length) filter._id = { $in: body.rowIds };
    else if (body.acceptHighConfidence) filter.confidence = { $gte: 0.8 };
    const rows = await this.rows.find(filter);
    let created = 0;
    for (const row of rows) {
      const isCredit = row.creditPaise > 0;
      const amount = isCredit ? row.creditPaise : row.debitPaise;
      const type = coerceTxType(row.type ?? (isCredit ? 'income' : 'expense'));
      try {
        await this.ledger.create(String(stmt.userId), {
          accountId: String(stmt.accountId),
          type,
          channel: row.channel ?? 'other',
          date: row.date,
          amountPaise: amount,
          isCredit,
          categoryId: row.categoryId,
          subcategoryId: row.subcategoryId,
          merchant: row.merchant,
          narration: row.narration,
          upiRef: row.upiRef,
          balanceAfterPaise: row.balanceAfterPaise,
          source: 'statement',
          statementId: stmt._id,
          fingerprint: row.fingerprint ?? fingerprint({
            userId,
            accountLast4: stmt.accountLast4 ?? 'xxxx',
            date: isoDate(row.date),
            amountPaise: amount,
            ref: row.upiRef || row.narration,
            balanceAfterPaise: row.balanceAfterPaise,
          }),
          counterpartyAccountId: row.counterpartyAccountId,
          excludedFromReports: row.isInternalTransfer || row.excludedFromSpend || type === 'transfer',
          classifiedBy: row.classifiedBy,
        });
        created += 1;
        row.accepted = true;
        row.isDuplicate = false;
        await row.save();
        if (row.merchant && row.categoryId) {
          await this.merchants.updateOne(
            { userId: stmt.userId, normalizedPayee: normalizeNarration(row.merchant) },
            {
              $set: {
                displayName: row.merchant,
                type,
                categoryId: row.categoryId,
                subcategoryId: row.subcategoryId,
                channel: row.channel,
                source: 'committed',
              },
            },
            { upsert: true },
          );
        }
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          row.isDuplicate = true;
          await row.save();
          continue;
        }
        this.log.error(`Failed to book statement row ${String(row._id)}: ${String(err)}`);
        throw err;
      }
    }
    if (stmt.reconMatched && stmt.bankCode) {
      await this.profiles.updateOne(
        { bankCode: stmt.bankCode, userId: stmt.userId },
        {
          $set: {
            bankName: stmt.bankName,
            status: 'stable',
            fingerprints: [stmt.bankName ?? '', stmt.ifsc ?? ''].filter(Boolean),
          },
          $setOnInsert: { isBuiltin: false },
        },
        { upsert: true },
      );
    }
    if (stmt.closingBalancePaise && stmt.accountId) {
      await this.accounts.updateOne(
        { _id: stmt.accountId },
        { $set: { currentBalancePaise: stmt.closingBalancePaise } },
      );
    }
    stmt.status = 'committed';
    await this.saveIgnoringProgress(stmt);
    await this.markProgress(String(stmt.userId), String(stmt._id), {
      status: 'done',
      phase: 'commit',
      label: `Booked ${created} transaction${created === 1 ? '' : 's'}`,
      done: stmt.rowCount ?? created,
      total: stmt.rowCount ?? created,
      percent: 100,
    });
    return { statement: stmt, created };
  }

  listProfiles(userId: string) {
    return this.profiles
      .find({
        $or: [
          { userId: new Types.ObjectId(userId) },
          { isBuiltin: true },
          { userId: { $exists: false } },
        ],
      })
      .sort({ bankCode: 1 })
      .lean()
      .exec();
  }

  private async matchAccount(userId: Types.ObjectId, header: ExtractedHeader) {
    if (header.accountLast4) {
      const byLast4 = await this.accounts.findOne({
        userId,
        last4: header.accountLast4,
        isActive: { $ne: false },
      });
      if (byLast4) return byLast4;
    }
    if (header.ifsc) {
      const prefix = header.ifsc.slice(0, 4);
      const byIfsc = await this.accounts.findOne({
        userId,
        ifscPrefix: prefix,
        isActive: { $ne: false },
      });
      if (byIfsc) return byIfsc;
    }
    return null;
  }

  private applyHeader(stmt: StatementDocument, header: ExtractedHeader) {
    stmt.accountLast4 = header.accountLast4;
    stmt.ifsc = header.ifsc;
    stmt.periodFrom = header.periodFrom;
    stmt.periodTo = header.periodTo;
    stmt.openingBalancePaise = header.openingBalancePaise;
    stmt.closingBalancePaise = header.closingBalancePaise;
    stmt.totalDebitPaise = header.totalDebitPaise;
    stmt.totalCreditPaise = header.totalCreditPaise;
    stmt.bankCode = header.bankCode || stmt.bankCode;
    stmt.bankName = header.bankName || stmt.bankName;
  }

  private async fillMissingPeriods(
    userId: string,
    docs: Array<{ _id: Types.ObjectId; periodFrom?: Date; periodTo?: Date }>,
  ) {
    const missing = docs.filter((d) => !d.periodFrom || !d.periodTo);
    if (!missing.length) return;
    const bounds = await this.rows.aggregate<{ _id: Types.ObjectId; from: Date; to: Date }>([
      {
        $match: {
          statementId: { $in: missing.map((d) => d._id) },
          userId: new Types.ObjectId(userId),
        },
      },
      { $group: { _id: '$statementId', from: { $min: '$date' }, to: { $max: '$date' } } },
    ]);
    const map = new Map(bounds.map((b) => [String(b._id), b]));
    for (const d of missing) {
      const b = map.get(String(d._id));
      if (!b) continue;
      if (!d.periodFrom) d.periodFrom = b.from;
      if (!d.periodTo) d.periodTo = b.to;
    }
  }

  private publicStatement(doc: {
    _id?: unknown;
    id?: unknown;
    accountId?: unknown;
    originalName?: string;
    storedPath?: string;
    pdfPassword?: string;
    bankCode?: string;
    bankName?: string;
    accountLast4?: string;
    ifsc?: string;
    periodFrom?: Date;
    periodTo?: Date;
    openingBalancePaise?: number;
    closingBalancePaise?: number;
    totalDebitPaise?: number;
    totalCreditPaise?: number;
    status?: string;
    error?: string;
    reconMatched?: boolean;
    reconDeltaPaise?: number;
    rowCount?: number;
    parseMethod?: string;
    classifyMethod?: string;
    classifyProvider?: string;
    createdAt?: Date;
    updatedAt?: Date;
    progress?: Record<string, unknown>;
  }, bookedCount = 0) {
    const from = doc.periodFrom ? new Date(doc.periodFrom) : undefined;
    const to = doc.periodTo ? new Date(doc.periodTo) : undefined;
    const createdAt = doc.createdAt ? new Date(doc.createdAt) : undefined;
    return {
      id: String(doc.id ?? doc._id),
      accountId: doc.accountId ? String(doc.accountId) : undefined,
      originalName: doc.originalName,
      bankCode: doc.bankCode,
      bankName: doc.bankName,
      accountLast4: doc.accountLast4,
      ifsc: doc.ifsc,
      periodFrom: from && !Number.isNaN(from.getTime()) ? isoDate(from) : undefined,
      periodTo: to && !Number.isNaN(to.getTime()) ? isoDate(to) : undefined,
      monthLabel: statementMonthLabel(from, to, createdAt),
      openingBalancePaise: doc.openingBalancePaise ?? 0,
      closingBalancePaise: doc.closingBalancePaise ?? 0,
      totalDebitPaise: doc.totalDebitPaise ?? 0,
      totalCreditPaise: doc.totalCreditPaise ?? 0,
      status: doc.status,
      error: doc.error,
      reconMatched: doc.reconMatched,
      reconDeltaPaise: doc.reconDeltaPaise,
      rowCount: doc.rowCount ?? 0,
      parseMethod: doc.parseMethod,
      classifyMethod: doc.classifyMethod,
      classifyProvider: doc.classifyProvider,
      pdfPassword: doc.pdfPassword || undefined,
      hasOriginal: Boolean(doc.storedPath),
      createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString() : undefined,
      progress: doc.progress ?? undefined,
      bookedCount,
    };
  }

  private beginRun(statementId: string) {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.runs.set(statementId, runId);
    return runId;
  }

  private isStaleRun(runId: string | undefined, current?: { runId?: string } | null) {
    if (!runId) return false;
    const currentTime = runTime(current?.runId);
    const incomingTime = runTime(runId);
    return Boolean(currentTime && incomingTime && incomingTime < currentTime);
  }

  private async saveIgnoringProgress(stmt: StatementDocument) {
    (stmt as { $ignore?: (path: string) => void }).$ignore?.('progress');
    await stmt.save();
  }

  private async markProgress(
    userId: string,
    statementId: string,
    value: {
      phase?: string;
      label: string;
      done: number;
      total: number;
      percent: number;
      currentRow?: string;
      status?: 'running' | 'done' | 'error' | 'cancelled';
      error?: string;
    },
  ) {
    const terminal = value.status === 'cancelled' || value.status === 'error' || value.status === 'done';
    if (!terminal && (await this.cache.isCancelled(userId, statementId))) {
      return;
    }
    const runId = this.runAls.getStore() ?? this.runs.get(statementId);
    const current =
      (await this.cache.getRecogniseProgress(userId, statementId)) ??
      ((
        await this.statements.findById(statementId).select('progress').lean().exec()
      )?.progress as RecogniseProgress | undefined);
    if (value.status !== 'cancelled' && this.isStaleRun(runId, current)) {
      return;
    }
    const status = value.status ?? (value.percent >= 100 ? 'done' : 'running');
    const payload: RecogniseProgress = {
      ...value,
      status,
      statementId,
      updatedAt: new Date().toISOString(),
      runId: runId ?? current?.runId,
      currentRow: status === 'running' ? value.currentRow : undefined,
    };
    await this.cache.setRecogniseProgress(userId, payload);
    await this.statements.updateOne({ _id: statementId }, { $set: { progress: payload } });
  }

  private async resolveProgress(
    userId: string,
    doc: { _id?: unknown; status?: string; rowCount?: number; classifyMethod?: string; progress?: unknown },
    live?: RecogniseProgress | null,
  ) {
    const saved = (doc.progress ?? undefined) as RecogniseProgress | undefined;
    let progress = pickProgress(saved, live ?? null);
    const healed = healProgress(doc, progress);
    if (healed && progressChanged(progress, healed)) {
      progress = healed;
      const statusPatch =
        doc.status === 'processing' && (doc.rowCount ?? 0) > 0 && healed.status === 'done'
          ? { status: 'needs_review' }
          : {};
      await this.statements.updateOne(
        { _id: new Types.ObjectId(String(doc._id)) },
        { $set: { progress: healed, ...statusPatch } },
      );
      if (statusPatch.status) doc.status = statusPatch.status;
      doc.progress = healed;
      await this.cache.setRecogniseProgress(userId, { ...healed, statementId: String(doc._id) });
    }
    return progress ?? undefined;
  }

  private async throwIfCancelled(userId: string, statementId: string) {
    if (await this.cache.isCancelled(userId, statementId)) {
      throw new JobCancelledError();
    }
  }

  private async markCancelled(userId: string, statementId: string, total = 0) {
    const live = await this.cache.getRecogniseProgress(userId, statementId);
    await this.markProgress(userId, statementId, {
      status: 'cancelled',
      phase: live?.phase,
      label: live?.done ? `Stopped at row ${live.done} of ${live.total || total}` : 'Stopped',
      done: live?.done ?? 0,
      total: live?.total ?? total,
      percent: live?.percent ?? 0,
      currentRow: live?.currentRow,
    });
    const stmt = await this.statements.findById(statementId);
    if (stmt && (stmt.status === 'processing' || stmt.status === 'queued')) {
      if (stmt.rowCount) {
        stmt.status = 'needs_review';
      } else {
        stmt.status = 'failed';
        stmt.error = stmt.error || 'Stopped.';
      }
      await this.saveIgnoringProgress(stmt);
    }
  }

  async cancel(userId: string, statementId: string) {
    if (!Types.ObjectId.isValid(statementId)) throw new NotFoundException('Statement not found');
    const stmt = await this.statements.findOne({
      _id: statementId,
      userId: new Types.ObjectId(userId),
    });
    if (!stmt) throw new NotFoundException('Statement not found');
    await this.cache.requestCancel(userId, statementId);
    await this.markCancelled(userId, statementId, stmt.rowCount ?? 0);
    return { cancelled: true, id: statementId };
  }

  async unbook(userId: string, statementId: string) {
    if (!Types.ObjectId.isValid(statementId)) throw new NotFoundException('Statement not found');
    const stmt = await this.statements.findOne({
      _id: statementId,
      userId: new Types.ObjectId(userId),
    });
    if (!stmt) throw new NotFoundException('Statement not found');
    await this.cache.requestCancel(userId, statementId);
    const result = await this.ledger.removeByStatement(userId, statementId);
    await this.rows.updateMany(
      { statementId: stmt._id, userId: stmt.userId },
      { $set: { accepted: false } },
    );
    if (stmt.status === 'committed') {
      stmt.status = 'needs_review';
      await this.saveIgnoringProgress(stmt);
    }
    await this.markProgress(userId, statementId, {
      status: 'cancelled',
      phase: 'commit',
      label: result.deleted
        ? `Removed ${result.deleted} booked transaction${result.deleted === 1 ? '' : 's'}`
        : 'No booked transactions to remove',
      done: 0,
      total: stmt.rowCount ?? 0,
      percent: 0,
    });
    return { deleted: result.deleted, statement: this.publicStatement(stmt.toObject(), 0) };
  }

  async remove(userId: string, statementId: string) {
    if (!Types.ObjectId.isValid(statementId)) throw new NotFoundException('Statement not found');
    const stmt = await this.statements.findOne({
      _id: statementId,
      userId: new Types.ObjectId(userId),
    });
    if (!stmt) throw new NotFoundException('Statement not found');
    await this.cache.requestCancel(userId, statementId);
    const txs = await this.ledger.removeByStatement(userId, statementId);
    await this.rows.deleteMany({ statementId: stmt._id, userId: stmt.userId });
    if (stmt.storedPath) {
      await this.storage.removePdf(stmt.storedPath);
    }
    await this.statements.deleteOne({ _id: stmt._id });
    return { deleted: true, transactions: txs.deleted };
  }

  async progress(userId: string, statementId: string) {
    if (!Types.ObjectId.isValid(statementId)) throw new NotFoundException('Statement not found');
    const stmt = await this.statements
      .findOne({ _id: statementId, userId: new Types.ObjectId(userId) })
      .select('progress rowCount status classifyMethod')
      .lean()
      .exec();
    if (!stmt) throw new NotFoundException('Statement not found');
    const live = await this.cache.getRecogniseProgress(userId, statementId);
    const progress = await this.resolveProgress(userId, stmt, live);
    return (
      progress ?? {
        status:
          stmt.status === 'processing' || stmt.status === 'queued'
            ? 'running'
            : 'idle',
        label: stmt.status === 'processing' ? 'Working…' : '',
        done: 0,
        total: stmt.rowCount ?? 0,
        percent: stmt.status === 'processing' ? 8 : 0,
        statementId,
      }
    );
  }

  private findCounterparty(
    row: { narration: string; upiRef?: string },
    accounts: AccountDocument[],
    selfId?: Types.ObjectId,
  ) {
    return accounts.find((a) => {
      if (selfId && String(a._id) === String(selfId)) return false;
      if (a.last4 && row.narration.includes(a.last4)) return true;
      return false;
    });
  }

  async recognise(userId: string, statementId: string, providerId?: string) {
    const stmt = await this.statements.findOne({
      _id: statementId,
      userId: new Types.ObjectId(userId),
    });
    if (!stmt) throw new NotFoundException('Statement not found');
    const rows = await this.rows.find({
      statementId: stmt._id,
      userId: stmt.userId,
      classifiedBy: { $ne: 'user' },
    });
    if (!rows.length) return { updated: 0, used: null };
    const total = rows.length;
    const runId = this.beginRun(statementId);
    return this.runAls.run(runId, async () => {
    await this.cache.clearCancel(userId, statementId);
    await this.markProgress(userId, statementId, {
      phase: 'ai',
      label: `Recognising 0 of ${total} rows`,
      done: 0,
      total,
      percent: 30,
    });
    try {
    const cats = await this.categories.find({
      $or: [{ isSystem: true }, { userId: stmt.userId }],
    });
    const slugs = cats.map((c) => {
      const parent = c.parentId ? cats.find((p) => String(p._id) === String(c.parentId)) : undefined;
      return { slug: c.slug, name: c.name, parent: parent?.slug };
    });
    const family = await this.family.hints(userId);
    const rules = await this.classifyRules.hints(userId);
    const acc = stmt.accountId ? await this.accounts.findById(stmt.accountId) : null;
    const familyNames = family.flatMap((m) => [m.name, ...(m.aliases ?? [])]);
    const hints = rows.map((row, i) => ({
      i,
      narration: familySearchText(row.narration) || row.narration.slice(0, 220),
      debitPaise: row.debitPaise,
      creditPaise: row.creditPaise,
      merchant: row.merchant,
      type: row.type,
    }));
    const ai = await this.ai.classifyRows(
      userId,
      hints,
      slugs,
      providerId,
      familyNames,
      async (done, all, info) => {
        const current = rows[Math.max(0, (info?.waitingFrom ?? done) - 1)];
        const waiting =
          info?.waitingFrom && info?.waitingTo
            ? `Waiting on AI · rows ${info.waitingFrom}–${info.waitingTo} of ${all}`
            : done === 0
              ? `Sending ${Math.min(35, all)} of ${all} rows to AI`
              : `AI classified ${done} of ${all} rows`;
        await this.markProgress(userId, statementId, {
          phase: 'ai',
          label: waiting,
          done,
          total: all,
          percent: 30 + (done / Math.max(all, 1)) * 50,
          currentRow: (current?.merchant || current?.narration || '').slice(0, 80),
        });
      },
      () => this.cache.isCancelled(userId, statementId),
    );
    const byIndex = new Map(ai.rows.map((r) => [r.i, r]));
    let updated = 0;
    for (let i = 0; i < rows.length; i++) {
      await this.throwIfCancelled(userId, statementId);
      if (i === 0 || (i + 1) % 5 === 0 || i === rows.length - 1) {
        await this.markProgress(userId, statementId, {
          phase: 'ai',
          label: `Saving types · row ${i + 1} of ${total}`,
          done: i + 1,
          total,
          percent: 80 + ((i + 1) / Math.max(total, 1)) * 18,
          currentRow: (rows[i].merchant || rows[i].narration || '').slice(0, 80),
        });
      }
      const guess = byIndex.get(i);
      if (!guess) continue;
      const row = rows[i];
      const decided = finalizeRecognisedType({
        narration: row.narration,
        isCredit: row.creditPaise > 0,
        guessedType: guess.type,
        guessedSlug: guess.subcategorySlug || guess.categorySlug,
        isTransfer: guess.isTransfer,
        family,
        rules,
        amountPaise: row.creditPaise > 0 ? row.creditPaise : row.debitPaise,
        accountId: stmt.accountId ? String(stmt.accountId) : undefined,
        bank: acc?.bank || stmt.bankName,
      });
      const ids = idsFromSlug(decided.categorySlug, cats);
      row.type = decided.type;
      row.merchant = decided.familyHit?.name || decided.ruleHit?.merchant || guess.merchant || row.merchant;
      row.categoryId = ids.categoryId as Types.ObjectId | undefined;
      row.subcategoryId = ids.subcategoryId as Types.ObjectId | undefined;
      row.isInternalTransfer = decided.type === 'transfer';
      row.excludedFromSpend = row.isInternalTransfer;
      row.classifiedBy = decided.classifiedBy === 'rules' ? 'ai' : decided.classifiedBy;
      row.confidence = Math.max(
        row.confidence ?? 0,
        decided.familyHit ? 0.97 : decided.ruleHit ? 0.96 : 0.8,
      );
      await row.save();
      updated += 1;
    }
    stmt.classifyMethod = 'ai';
    stmt.classifyProvider = ai.used?.name;
    if (stmt.status === 'processing' || stmt.status === 'queued') {
      stmt.status = 'needs_review';
    }
    await this.saveIgnoringProgress(stmt);
    await this.markProgress(userId, statementId, {
      status: 'done',
      phase: 'ai',
      label: `Recognised ${updated} of ${total} rows`,
      done: total,
      total,
      percent: 100,
    });
    return { updated, used: ai.used };
    } catch (err) {
      if (isJobCancelled(err)) {
        await this.markCancelled(userId, statementId, total);
        return { updated: 0, used: null, cancelled: true };
      }
      await this.markProgress(userId, statementId, {
        status: 'error',
        phase: 'ai',
        label: 'Recognition failed',
        done: 0,
        total,
        percent: 100,
        error: (err as Error).message,
      });
      throw err;
    }
    });
  }

  private async inferWithAi(
    text: string,
    userId: string,
    detected: { code: string; name: string },
  ): Promise<ParseResult> {
    const snippet = text.slice(0, 28000);
    const json = await this.ai.generateJson<{
      layout: {
        dateFormat: string;
        sortOrder: 'asc' | 'desc';
        skipRegexes: string[];
        wrapContinuesWithoutDate: boolean;
        amountMode: string;
      };
      header: {
        last4?: string;
        ifsc?: string;
        openingRupees: number;
        closingRupees: number;
        totalDebitRupees: number;
        totalCreditRupees: number;
        periodFrom?: string;
        periodTo?: string;
      };
      rows: Array<{
        date: string;
        narration: string;
        debitRupees: number;
        creditRupees: number;
        balanceRupees?: number;
      }>;
    }>(
      `You extract Indian bank statement transactions from plain text.
Return JSON with keys layout, header, rows.
layout: dateFormat, sortOrder (asc oldest-first, desc newest-first), skipRegexes, wrapContinuesWithoutDate, amountMode.
header: last4, ifsc, openingRupees, closingRupees, totalDebitRupees, totalCreditRupees, periodFrom, periodTo (ISO dates).
rows: date ISO, narration, debitRupees, creditRupees, balanceRupees.
Ignore legal pages. Amounts in rupees with paise. Bank seems to be ${detected.name}.
TEXT:\n${snippet}`,
    );
    await this.profiles.create({
      userId: new Types.ObjectId(userId),
      bankCode: detected.code === 'unknown' ? `learned_${Date.now()}` : detected.code,
      bankName: detected.name,
      fingerprints: [detected.name],
      layout: json.layout,
      status: 'draft',
      isBuiltin: false,
    });
    const rows: ExtractedRow[] = (json.rows ?? []).map((r) => ({
      date: new Date(r.date),
      narration: r.narration,
      debitPaise: rupeesToPaise(r.debitRupees ?? 0),
      creditPaise: rupeesToPaise(r.creditRupees ?? 0),
      balanceAfterPaise: r.balanceRupees != null ? rupeesToPaise(r.balanceRupees) : undefined,
      upiRef: extractUpiRrn(r.narration),
    }));
    if (json.layout?.sortOrder === 'desc') rows.reverse();
    const header: ExtractedHeader = {
      bankCode: detected.code,
      bankName: detected.name,
      accountLast4: json.header?.last4,
      ifsc: json.header?.ifsc,
      periodFrom: json.header?.periodFrom ? new Date(json.header.periodFrom) : undefined,
      periodTo: json.header?.periodTo ? new Date(json.header.periodTo) : undefined,
      openingBalancePaise: rupeesToPaise(json.header?.openingRupees ?? 0),
      closingBalancePaise: rupeesToPaise(json.header?.closingRupees ?? 0),
      totalDebitPaise: rupeesToPaise(json.header?.totalDebitRupees ?? 0),
      totalCreditPaise: rupeesToPaise(json.header?.totalCreditRupees ?? 0),
    };
    return { header, rows, method: 'gemini_draft' };
  }
}

function parseKnownLayout(code: string, text: string): ParseResult | null {
  if (code === 'idfc_first') return parseIdfcFirst(text);
  if (code === 'au_bank') return parseAuBank(text);
  if (code === 'hdfc') return parseHdfc(text);
  if (code === 'indusind') return parseIndusind(text);
  if (code === 'sbi') return parseSbi(text);
  return null;
}

function parseKnownLayoutFallback(detectedCode: string, text: string): ParseResult | null {
  for (const code of ['sbi', 'hdfc', 'idfc_first', 'au_bank', 'indusind']) {
    if (code === detectedCode) continue;
    const attempt = parseKnownLayout(code, text);
    if (attempt?.rows.length) return attempt;
  }
  return null;
}

function applyProfile(
  text: string,
  _profile: ParserProfileDocument,
  detected: { code: string; name: string },
): ParseResult | null {
  return parseKnownLayout(detected.code, text);
}

function isJobCancelled(err: unknown) {
  return err instanceof JobCancelledError || (err instanceof Error && err.name === 'JobCancelledError');
}

const TERMINAL_PROGRESS = new Set(['done', 'cancelled', 'error']);

function runTime(runId?: string) {
  const n = Number(String(runId ?? '').split('-')[0]);
  return Number.isFinite(n) ? n : 0;
}

function progressTime(p?: { updatedAt?: string } | null) {
  if (!p?.updatedAt) return 0;
  const t = new Date(p.updatedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isFresh(p?: RecogniseProgress | null, ms = 90_000) {
  return Boolean(p && p.status === 'running' && progressTime(p) > Date.now() - ms);
}

function pickProgress(saved?: RecogniseProgress | null, live?: RecogniseProgress | null) {
  if (!saved) return live ?? null;
  if (!live) return saved;
  if (TERMINAL_PROGRESS.has(saved.status) && live.status === 'running' && progressTime(live) <= progressTime(saved)) {
    return saved;
  }
  if (TERMINAL_PROGRESS.has(live.status) && saved.status === 'running' && progressTime(saved) <= progressTime(live)) {
    return live;
  }
  return progressTime(live) >= progressTime(saved) ? live : saved;
}

function healProgress(
  doc: { status?: string; rowCount?: number; classifyMethod?: string },
  progress?: RecogniseProgress | null,
): RecogniseProgress | null | undefined {
  if (!progress) return progress;
  if (progress.status === 'running' && progress.percent >= 100) {
    return {
      ...progress,
      status: 'done',
      currentRow: undefined,
      label: progress.label || 'Completed',
      updatedAt: new Date().toISOString(),
    };
  }
  if (doc.status === 'committed' && (progress.status === 'running' || progress.status === 'cancelled')) {
    return {
      ...progress,
      status: 'done',
      percent: 100,
      currentRow: undefined,
      label: progress.total ? `Booked · ${progress.total} rows` : 'Completed',
      updatedAt: new Date().toISOString(),
    };
  }
  if (progress.status !== 'running') return progress;
  if (isFresh(progress)) return progress;
  const leftover =
    doc.status === 'committed' ||
    doc.status === 'failed' ||
    doc.status === 'needs_ai_key' ||
    (doc.status === 'processing' && (doc.rowCount ?? 0) > 0 && Boolean(doc.classifyMethod));
  if (!leftover) return progress;
  return {
    ...progress,
    status: doc.status === 'failed' ? 'error' : 'done',
    percent: 100,
    currentRow: undefined,
    label:
      progress.done && progress.total
        ? `Completed · ${progress.done} of ${progress.total} rows`
        : `Completed · ${doc.rowCount ?? 0} rows`,
    updatedAt: new Date().toISOString(),
  };
}

function progressChanged(a?: RecogniseProgress | null, b?: RecogniseProgress | null) {
  if (!b) return false;
  if (!a) return true;
  return a.status !== b.status || a.percent !== b.percent || a.label !== b.label;
}
