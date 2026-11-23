import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from '../accounts/account.schema';
import { Category, CategorySchema } from '../categories/category.schema';
import { Statement, StatementRow, StatementRowSchema, StatementSchema } from '../statements/statement.schema';
import { Transaction, TransactionSchema } from '../transactions/transaction.schema';
import { ClassifyRule, ClassifyRuleSchema } from './classify-rule.schema';
import { ClassifyRulesController } from './classify-rules.controller';
import { ClassifyRulesService } from './classify-rules.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ClassifyRule.name, schema: ClassifyRuleSchema },
      { name: Statement.name, schema: StatementSchema },
      { name: StatementRow.name, schema: StatementRowSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Account.name, schema: AccountSchema },
    ]),
  ],
  controllers: [ClassifyRulesController],
  providers: [ClassifyRulesService],
  exports: [ClassifyRulesService],
})
export class ClassifyRulesModule {}
