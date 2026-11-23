import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsDateString, IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { EmptyToUndefined } from '../../common/empty-to-undefined';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { rupeesToPaise } from '../../common/money';
import { BillsService } from './bills.service';

class BillDto {
  @IsString()
  name: string;
  @IsNumber()
  amountRupees: number;
  @IsDateString()
  dueDate: string;
  @EmptyToUndefined()
  @IsOptional()
  @IsMongoId()
  accountId?: string;
  @EmptyToUndefined()
  @IsOptional()
  @IsMongoId()
  categoryId?: string;
  @IsOptional()
  @IsString()
  frequency?: string;
}

@Controller('bills')
@UseGuards(JwtAuthGuard)
export class BillsController {
  constructor(private svc: BillsService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.svc.list(user.userId);
  }

  @Get('upcoming')
  upcoming(@CurrentUser() user: { userId: string }) {
    return this.svc.upcoming(user.userId);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: BillDto) {
    return this.svc.create(user.userId, {
      ...dto,
      amountPaise: rupeesToPaise(dto.amountRupees),
      dueDate: new Date(dto.dueDate),
    } as never);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: Partial<BillDto>,
  ) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.amountRupees != null) patch.amountPaise = rupeesToPaise(dto.amountRupees);
    if (dto.dueDate) patch.dueDate = new Date(dto.dueDate);
    delete patch.amountRupees;
    return this.svc.update(user.userId, id, patch);
  }

  @Post(':id/pay')
  pay(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { accountId: string },
  ) {
    return this.svc.markPaid(user.userId, id, body.accountId);
  }
}
