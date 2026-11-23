import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionsModule } from '../transactions/transactions.module';
import { Bill, BillSchema } from './bill.schema';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Bill.name, schema: BillSchema }]),
    TransactionsModule,
  ],
  controllers: [BillsController],
  providers: [BillsService],
  exports: [BillsService],
})
export class BillsModule {}
