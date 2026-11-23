import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsModule } from '../analytics/analytics.module';
import { Insight, InsightSchema } from './insight.schema';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [
    AnalyticsModule,
    MongooseModule.forFeature([{ name: Insight.name, schema: InsightSchema }]),
  ],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
