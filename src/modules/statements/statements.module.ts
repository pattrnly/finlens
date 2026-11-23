import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from '../accounts/account.schema';
import { Category, CategorySchema } from '../categories/category.schema';
import { Merchant, MerchantSchema } from '../merchants/merchant.schema';
import { ParserProfile, ParserProfileSchema } from '../parser-profiles/parser-profile.schema';
import { Transaction, TransactionSchema } from '../transactions/transaction.schema';
import { ClassifyRulesModule } from '../classify-rules/classify-rules.module';
import { FamilyModule } from '../family/family.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { StatementProcessor } from './statement.processor';
import { Statement, StatementRow, StatementRowSchema, StatementSchema } from './statement.schema';
import { ParserProfilesController, StatementsController } from './statements.controller';
import { StatementsService } from './statements.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'statements' }),
    MongooseModule.forFeature([
      { name: Statement.name, schema: StatementSchema },
      { name: StatementRow.name, schema: StatementRowSchema },
      { name: Account.name, schema: AccountSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Merchant.name, schema: MerchantSchema },
      { name: ParserProfile.name, schema: ParserProfileSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    TransactionsModule,
    FamilyModule,
    ClassifyRulesModule,
  ],
  controllers: [StatementsController, ParserProfilesController],
  providers: [StatementsService, StatementProcessor],
  exports: [StatementsService],
})
export class StatementsModule {}
