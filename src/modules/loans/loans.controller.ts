import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { rupeesToPaise } from '../../common/money';
import { LoansService } from './loans.service';

class LoanDto {
  @IsString()
  name: string;
  @IsOptional()
  @IsString()
  loanType?: string;
  @IsOptional()
  @IsString()
  lender?: string;
  @IsNumber()
  principalRupees: number;
  @IsNumber()
  emiRupees: number;
  @IsOptional()
  @IsNumber()
  interestRate?: number;
  @IsOptional()
  @IsNumber()
  tenureMonths?: number;
  @IsOptional()
  @IsDateString()
  nextDue?: string;
}

@Controller('loans')
@UseGuards(JwtAuthGuard)
export class LoansController {
  constructor(private svc: LoansService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.svc.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: LoanDto) {
    return this.svc.create(user.userId, {
      name: dto.name,
      loanType: dto.loanType,
      lender: dto.lender,
      principalPaise: rupeesToPaise(dto.principalRupees),
      outstandingPaise: rupeesToPaise(dto.principalRupees),
      emiPaise: rupeesToPaise(dto.emiRupees),
      interestRateBps: Math.round((dto.interestRate ?? 0) * 100),
      tenureMonths: dto.tenureMonths ?? 12,
      remainingMonths: dto.tenureMonths ?? 12,
      nextDue: dto.nextDue ? new Date(dto.nextDue) : undefined,
    });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: Partial<LoanDto>,
  ) {
    return this.svc.update(user.userId, id, dto as never);
  }

  @Post(':id/pay')
  pay(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { accountId: string },
  ) {
    return this.svc.payEmi(user.userId, id, body.accountId);
  }
}
