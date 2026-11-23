import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsMongoId, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { AMOUNT_OPS, MATCH_MODES, RULE_DIRECTIONS } from '../../common/classify-rule';
import { CurrentUser } from '../../common/current-user.decorator';
import { EmptyToUndefined } from '../../common/empty-to-undefined';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { TX_TYPES } from '../../common/types';
import { ClassifyRulesService } from './classify-rules.service';

class RuleDto {
  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Enter at least 2 characters to match' })
  pattern?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsIn([...MATCH_MODES])
  match?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsIn([...RULE_DIRECTIONS])
  direction?: string;

  @IsIn([...TX_TYPES])
  type: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsMongoId()
  accountId?: string | null;

  @IsOptional()
  @IsString()
  bank?: string | null;

  @EmptyToUndefined()
  @IsOptional()
  @IsIn([...AMOUNT_OPS])
  amountOp?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountRupees?: number;
}

class PatchRuleDto {
  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Enter at least 2 characters to match' })
  pattern?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsIn([...MATCH_MODES])
  match?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsIn([...RULE_DIRECTIONS])
  direction?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsIn([...TX_TYPES])
  type?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsMongoId()
  accountId?: string | null;

  @IsOptional()
  @IsString()
  bank?: string | null;

  @EmptyToUndefined()
  @IsOptional()
  @IsIn([...AMOUNT_OPS])
  amountOp?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountRupees?: number;
}

@Controller('classify-rules')
@UseGuards(JwtAuthGuard)
export class ClassifyRulesController {
  constructor(private rules: ClassifyRulesService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.rules.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: RuleDto) {
    return this.rules.create(user.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() dto: PatchRuleDto) {
    return this.rules.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.rules.remove(user.userId, id);
  }
}
