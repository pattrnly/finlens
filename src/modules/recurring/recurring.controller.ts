import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsIn, IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { EmptyToUndefined } from '../../common/empty-to-undefined';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { istNoon } from '../../common/dates';
import { rupeesToPaise } from '../../common/money';
import { RecurringService } from './recurring.service';

class RuleDto {
  @IsMongoId()
  accountId: string;

  @IsString()
  name: string;

  @IsNumber()
  amountRupees: number;

  @IsOptional()
  @IsIn(['expense', 'income', 'emi', 'transfer'])
  type?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsMongoId()
  subcategoryId?: string;

  @IsOptional()
  @IsIn(['once', 'weekly', 'monthly', 'quarterly', 'yearly'])
  frequency?: string;

  @IsDateString()
  nextRun: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  autoCreate?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

class PatchRuleDto {
  @IsOptional()
  @IsMongoId()
  accountId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  amountRupees?: number;

  @IsOptional()
  @IsIn(['expense', 'income', 'emi', 'transfer'])
  type?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsMongoId()
  subcategoryId?: string;

  @IsOptional()
  @IsIn(['once', 'weekly', 'monthly', 'quarterly', 'yearly'])
  frequency?: string;

  @IsOptional()
  @IsDateString()
  nextRun?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  autoCreate?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

@Controller('recurring')
@UseGuards(JwtAuthGuard)
export class RecurringController {
  constructor(private svc: RecurringService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.svc.list(user.userId);
  }

  @Get('upcoming')
  upcoming(@CurrentUser() user: { userId: string }) {
    return this.svc.upcoming(user.userId);
  }

  @Post('run-due')
  runDue() {
    return this.svc.runDue();
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: RuleDto) {
    const nextRun = istNoon(dto.nextRun);
    return this.svc.create(user.userId, {
      accountId: dto.accountId,
      name: dto.name,
      amountPaise: rupeesToPaise(dto.amountRupees),
      type: dto.type ?? 'expense',
      categoryId: dto.categoryId,
      subcategoryId: dto.subcategoryId,
      frequency: dto.frequency ?? 'monthly',
      nextRun,
      endDate: dto.endDate ? istNoon(dto.endDate) : undefined,
      dayOfMonth: Number(dto.nextRun.slice(8, 10)),
      autoCreate: dto.autoCreate ?? true,
      merchant: dto.name,
      note: dto.note,
    });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: PatchRuleDto,
  ) {
    return this.svc.update(user.userId, id, {
      accountId: dto.accountId,
      name: dto.name,
      amountPaise: dto.amountRupees != null ? rupeesToPaise(dto.amountRupees) : undefined,
      type: dto.type,
      categoryId: dto.categoryId,
      subcategoryId: dto.subcategoryId,
      frequency: dto.frequency,
      nextRun: dto.nextRun ? istNoon(dto.nextRun) : undefined,
      endDate: dto.endDate ? istNoon(dto.endDate) : undefined,
      dayOfMonth: dto.nextRun ? Number(dto.nextRun.slice(8, 10)) : undefined,
      autoCreate: dto.autoCreate,
      isActive: dto.isActive,
      note: dto.note,
      merchant: dto.name,
    });
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.svc.remove(user.userId, id);
  }
}
