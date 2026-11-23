import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { LoanLedgerService } from './loan-ledger.service';
import type { Impact, LoanStatus } from './types';

class DisbursementDto {
  @IsOptional()
  @IsString()
  id?: string;
  @IsNumber()
  @Min(0.01)
  amount: number;
  @IsDateString()
  date: string;
}

class RateChangeDto {
  @IsOptional()
  @IsString()
  id?: string;
  @IsDateString()
  date: string;
  @IsNumber()
  @Min(0)
  annualRatePercent: number;
  @IsIn(['tenure', 'emi'])
  impact: Impact;
}

class PartPaymentDto {
  @IsOptional()
  @IsString()
  id?: string;
  @IsNumber()
  @Min(0.01)
  amount: number;
  @IsDateString()
  date: string;
  @IsIn(['tenure', 'emi'])
  impact: Impact;
}

class CreateLoanDto {
  @IsString()
  name: string;
  @IsDateString()
  emiStartDate: string;
  @IsNumber()
  @Min(0)
  initialAnnualRatePercent: number;
  @IsNumber()
  @Min(1)
  originalTenureMonths: number;
  @IsOptional()
  @IsIn(['open', 'closed'])
  status?: LoanStatus;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DisbursementDto)
  disbursements: DisbursementDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RateChangeDto)
  rateChanges?: RateChangeDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartPaymentDto)
  partPayments?: PartPaymentDto[];
}

class UpdateLoanDto {
  @IsOptional()
  @IsString()
  name?: string;
  @IsOptional()
  @IsDateString()
  emiStartDate?: string;
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialAnnualRatePercent?: number;
  @IsOptional()
  @IsNumber()
  @Min(1)
  originalTenureMonths?: number;
  @IsOptional()
  @IsIn(['open', 'closed'])
  status?: LoanStatus;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DisbursementDto)
  disbursements?: DisbursementDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RateChangeDto)
  rateChanges?: RateChangeDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartPaymentDto)
  partPayments?: PartPaymentDto[];
}

@Controller('loan-ledger')
@UseGuards(JwtAuthGuard)
export class LoanLedgerController {
  constructor(private svc: LoanLedgerService) {}

  @Get()
  portfolio(@CurrentUser() user: { userId: string }, @Query('asOf') asOf?: string) {
    return this.svc.portfolio(user.userId, asOf);
  }

  @Post('loans')
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateLoanDto) {
    return this.svc.create(user.userId, dto);
  }

  @Get('loans/:id')
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Query('asOf') asOf?: string) {
    return this.svc.get(user.userId, id, asOf);
  }

  @Patch('loans/:id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateLoanDto,
  ) {
    return this.svc.update(user.userId, id, dto);
  }

  @Delete('loans/:id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.svc.remove(user.userId, id);
  }

  @Post('loans/:id/rate-changes')
  addRateChange(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: RateChangeDto,
  ) {
    return this.svc.addRateChange(user.userId, id, dto);
  }

  @Delete('loans/:id/rate-changes/:eventId')
  removeRateChange(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('eventId') eventId: string,
  ) {
    return this.svc.removeRateChange(user.userId, id, eventId);
  }

  @Post('loans/:id/part-payments')
  addPartPayment(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: PartPaymentDto,
  ) {
    return this.svc.addPartPayment(user.userId, id, dto);
  }

  @Delete('loans/:id/part-payments/:eventId')
  removePartPayment(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('eventId') eventId: string,
  ) {
    return this.svc.removePartPayment(user.userId, id, eventId);
  }
}
