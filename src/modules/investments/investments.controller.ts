import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { rupeesToPaise } from '../../common/money';
import { InvestmentsService } from './investments.service';

class InvestmentDto {
  @IsString()
  name: string;
  @IsString()
  kind: string;
  @IsOptional()
  @IsString()
  platform?: string;
  @IsOptional()
  @IsNumber()
  units?: number;
  @IsOptional()
  @IsNumber()
  investedRupees?: number;
  @IsOptional()
  @IsNumber()
  currentValueRupees?: number;
  @IsOptional()
  isSip?: boolean;
  @IsOptional()
  @IsNumber()
  sipAmountRupees?: number;
}

class LotDto {
  @IsDateString()
  date: string;
  @IsString()
  lotType: string;
  @IsNumber()
  units: number;
  @IsNumber()
  amountRupees: number;
  @IsOptional()
  @IsString()
  note?: string;
}

@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentsController {
  constructor(private svc: InvestmentsService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.svc.list(user.userId);
  }

  @Get('summary')
  summary(@CurrentUser() user: { userId: string }) {
    return this.svc.summary(user.userId);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: InvestmentDto) {
    return this.svc.create(user.userId, {
      name: dto.name,
      kind: dto.kind,
      platform: dto.platform,
      units: dto.units ?? 0,
      investedPaise: rupeesToPaise(dto.investedRupees ?? 0),
      currentValuePaise: rupeesToPaise(dto.currentValueRupees ?? dto.investedRupees ?? 0),
      isSip: dto.isSip ?? dto.kind === 'sip',
      sipAmountPaise: rupeesToPaise(dto.sipAmountRupees ?? 0),
    });
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.svc.remove(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: Partial<InvestmentDto>,
  ) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.investedRupees != null) patch.investedPaise = rupeesToPaise(dto.investedRupees);
    if (dto.currentValueRupees != null) {
      patch.currentValuePaise = rupeesToPaise(dto.currentValueRupees);
    }
    delete patch.investedRupees;
    delete patch.currentValueRupees;
    delete patch.sipAmountRupees;
    return this.svc.update(user.userId, id, patch);
  }

  @Get(':id/lots')
  lots(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.svc.lotsFor(user.userId, id);
  }

  @Post(':id/lots')
  addLot(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: LotDto,
  ) {
    return this.svc.addLot(user.userId, id, {
      date: new Date(dto.date),
      lotType: dto.lotType,
      units: dto.units,
      amountPaise: rupeesToPaise(dto.amountRupees),
      note: dto.note,
    });
  }
}
