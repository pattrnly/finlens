import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from '../accounts/account.schema';
import { Category, CategorySchema } from '../categories/category.schema';
import { Investment, InvestmentSchema } from '../investments/investment.schema';
import { Transaction, TransactionSchema } from '../transactions/transaction.schema';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: Account.name, schema: AccountSchema },
      { name: Investment.name, schema: InvestmentSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
