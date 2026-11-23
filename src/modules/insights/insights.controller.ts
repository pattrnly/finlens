import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { InsightsService } from './insights.service';

class AnalyzeDto {
  @IsOptional()
  @IsString()
  question?: string;
  @IsOptional()
  @IsString()
  range?: string;
  @IsOptional()
  @IsString()
  from?: string;
  @IsOptional()
  @IsString()
  to?: string;
  @IsOptional()
  @IsString()
  providerId?: string;
}

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private svc: InsightsService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.svc.latest(user.userId);
  }

  @Post('analyze')
  analyze(@CurrentUser() user: { userId: string }, @Body() dto: AnalyzeDto) {
    return this.svc.analyze(user.userId, dto.question, dto.range ?? 'month', dto.providerId, dto.from, dto.to);
  }
}
