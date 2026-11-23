import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionsModule } from '../transactions/transactions.module';
import { RecurringController } from './recurring.controller';
import { RecurringRule, RecurringRuleSchema } from './recurring.schema';
import { RecurringService } from './recurring.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RecurringRule.name, schema: RecurringRuleSchema }]),
    TransactionsModule,
  ],
  controllers: [RecurringController],
  providers: [RecurringService],
  exports: [RecurringService],
})
export class RecurringModule {}
