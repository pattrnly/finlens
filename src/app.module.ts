import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillsModule } from './modules/bills/bills.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ClassifyRulesModule } from './modules/classify-rules/classify-rules.module';
import { FamilyModule } from './modules/family/family.module';
import { InsightsModule } from './modules/insights/insights.module';
import { InvestmentsModule } from './modules/investments/investments.module';
import { LoanLedgerModule } from './modules/loan-ledger/loan-ledger.module';
import { LoansModule } from './modules/loans/loans.module';
import { RecurringModule } from './modules/recurring/recurring.module';
import { RedisModule } from './modules/redis/redis.module';
import { StorageModule } from './modules/storage/storage.module';
import { StatementsModule } from './modules/statements/statements.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { UsersModule } from './modules/users/users.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI', 'mongodb://127.0.0.1:27017/finlens'),
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379'),
        },
      }),
    }),
    RedisModule,
    StorageModule,
    AiModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    CategoriesModule,
    ClassifyRulesModule,
    FamilyModule,
    TransactionsModule,
    RecurringModule,
    BillsModule,
    LoansModule,
    LoanLedgerModule,
    InvestmentsModule,
    StatementsModule,
    AnalyticsModule,
    InsightsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
