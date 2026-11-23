import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { EmptyToUndefined } from '../../common/empty-to-undefined';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { ACCOUNT_TYPES } from '../../common/types';
import { rupeesToPaise } from '../../common/money';
import { AccountsService } from './accounts.service';

class AccountDto {
  @IsString()
  @MinLength(1, { message: 'Please enter an account nickname' })
  name: string;

  @IsIn([...ACCOUNT_TYPES])
  type: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  bank?: string;

  @EmptyToUndefined()
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'Last 4 digits must be exactly 4 numbers, or leave blank' })
  last4?: string;

  @EmptyToUndefined()
  @IsOptional()
  @Matches(/^[A-Za-z]{4}$/, { message: 'IFSC prefix is the first 4 letters, or leave blank' })
  ifscPrefix?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsNumber({}, { message: 'Opening balance must be a number, or leave blank' })
  @Min(0, { message: 'Opening balance cannot be negative' })
  balanceRupees?: number;

  @IsOptional()
  @IsNumber()
  billingCycleDay?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private accounts: AccountsService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.accounts.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: AccountDto) {
    const { balanceRupees, ...rest } = dto;
    return this.accounts.create(user.userId, {
      ...rest,
      currentBalancePaise: rupeesToPaise(balanceRupees ?? 0),
    });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: Partial<AccountDto>,
  ) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.balanceRupees != null) patch.currentBalancePaise = rupeesToPaise(dto.balanceRupees);
    delete patch.balanceRupees;
    return this.accounts.update(user.userId, id, patch);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.accounts.remove(user.userId, id);
  }
}
