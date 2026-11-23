import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsDateString, IsIn, IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { EmptyToUndefined } from '../../common/empty-to-undefined';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { rupeesToPaise } from '../../common/money';
import { TX_TYPES } from '../../common/types';
import { TransactionsService } from './transactions.service';

class TxDto {
  @IsMongoId()
  accountId: string;

  @IsIn([...TX_TYPES])
  type: string;

  @IsDateString()
  date: string;

  @IsNumber()
  amountRupees: number;

  @EmptyToUndefined()
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsMongoId()
  subcategoryId?: string;

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsString()
  narration?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsBoolean()
  excludedFromReports?: boolean;
}

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private txs: TransactionsService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Query()
    q: {
      from?: string;
      to?: string;
      type?: string;
      accountId?: string;
      categoryId?: string;
      subcategoryId?: string;
      search?: string;
      amountOp?: string;
      amountRupees?: string;
      amountMinRupees?: string;
      amountMaxRupees?: string;
      direction?: string;
      source?: string;
      classifiedBy?: string;
      sort?: string;
    },
  ) {
    return this.txs.list(user.userId, q);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: TxDto) {
    return this.txs.create(user.userId, {
      accountId: dto.accountId,
      type: dto.type,
      date: new Date(dto.date),
      amountPaise: rupeesToPaise(dto.amountRupees),
      categoryId: dto.categoryId,
      subcategoryId: dto.subcategoryId,
      merchant: dto.merchant,
      narration: dto.narration,
      channel: dto.channel ?? 'other',
      excludedFromReports: dto.excludedFromReports,
    });
  }

  @Post('clear')
  clear(
    @CurrentUser() user: { userId: string },
    @Body() body: { from?: string; to?: string },
  ) {
    if (!body.from || !body.to) {
      throw new BadRequestException('Choose a start and end date to clear.');
    }
    return this.txs.removeRange(user.userId, body.from, body.to);
  }

  @Post('recognise')
  recogniseRange(
    @CurrentUser() user: { userId: string },
    @Body() body: { from?: string; to?: string; ids?: string[]; providerId?: string },
  ) {
    return this.txs.recognise(user.userId, body);
  }

  @Post(':id/recognise')
  recogniseOne(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { providerId?: string },
  ) {
    return this.txs.recognise(user.userId, { ids: [id], providerId: body?.providerId });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: Partial<TxDto>,
  ) {
    const patch: Record<string, unknown> = { ...dto, classifiedBy: 'user' };
    if (dto.amountRupees != null) patch.amountPaise = rupeesToPaise(dto.amountRupees);
    if (dto.date) patch.date = new Date(dto.date);
    delete patch.amountRupees;
    return this.txs.update(user.userId, id, patch);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.txs.remove(user.userId, id);
  }
}
