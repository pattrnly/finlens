import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoanLedgerController } from './loan-ledger.controller';
import {
  LoanLedger,
  LoanLedgerImport,
  LoanLedgerImportSchema,
  LoanLedgerSchema,
} from './loan-ledger.schema';
import { LoanLedgerService } from './loan-ledger.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LoanLedger.name, schema: LoanLedgerSchema },
      { name: LoanLedgerImport.name, schema: LoanLedgerImportSchema },
    ]),
  ],
  controllers: [LoanLedgerController],
  providers: [LoanLedgerService],
  exports: [LoanLedgerService],
})
export class LoanLedgerModule {}
