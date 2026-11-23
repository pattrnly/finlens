import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from '../categories/category.schema';
import { StatementRow, StatementRowSchema } from '../statements/statement.schema';
import { Transaction, TransactionSchema } from '../transactions/transaction.schema';
import { FamilyMember, FamilyMemberSchema } from './family-member.schema';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FamilyMember.name, schema: FamilyMemberSchema },
      { name: StatementRow.name, schema: StatementRowSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
  ],
  controllers: [FamilyController],
  providers: [FamilyService],
  exports: [FamilyService],
})
export class FamilyModule {}
