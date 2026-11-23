import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { EmptyToUndefined } from '../../common/empty-to-undefined';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RedisService } from '../redis/redis.service';
import { AI_KINDS } from './ai-provider.schema';
import { AiService } from './ai.service';

class CreateProviderDto {
  @IsString()
  name: string;

  @IsIn([...AI_KINDS])
  kind: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  model?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsString()
  apiKey: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

class PatchProviderDto {
  @IsOptional()
  @IsString()
  name?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsIn([...AI_KINDS])
  kind?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  model?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private svc: AiService,
    private cache: RedisService,
  ) {}

  @Get('catalog')
  catalog() {
    return this.svc.catalog();
  }

  @Get('recognise-progress')
  async recogniseProgress(
    @CurrentUser() user: { userId: string },
    @Query('statementId') statementId?: string,
  ) {
    const p = await this.cache.getRecogniseProgress(user.userId, statementId || undefined);
    return (
      p ?? {
        status: 'idle',
        label: '',
        done: 0,
        total: 0,
        percent: 0,
      }
    );
  }

  @Get('providers')
  list(@CurrentUser() user: { userId: string }) {
    return this.svc.list(user.userId);
  }

  @Post('providers')
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateProviderDto) {
    return this.svc.create(user.userId, dto);
  }

  @Post('providers/:id/test')
  test(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.svc.test(user.userId, id);
  }

  @Post('providers/:id/default')
  setDefault(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.svc.setDefault(user.userId, id);
  }

  @Patch('providers/:id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: PatchProviderDto,
  ) {
    return this.svc.update(user.userId, id, dto);
  }

  @Delete('providers/:id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.svc.remove(user.userId, id);
  }
}
