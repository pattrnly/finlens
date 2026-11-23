import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private svc: AnalyticsService) {}

  @Get('summary')
  summary(
    @CurrentUser() user: { userId: string },
    @Query() q: { range?: string; from?: string; to?: string },
  ) {
    return this.svc.summary(user.userId, q.range ?? 'month', q.from, q.to);
  }
}
