import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Allow, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { EmptyToUndefined } from '../../common/empty-to-undefined';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { FAMILY_RELATIONS } from './family-member.schema';
import { FamilyService } from './family.service';

class FamilyDto {
  @IsString()
  @MinLength(1, { message: 'Enter a name or UPI handle' })
  name: string;

  @Allow()
  @IsOptional()
  aliases?: string[] | string;

  @EmptyToUndefined()
  @IsOptional()
  @IsIn([...FAMILY_RELATIONS])
  relation?: string;
}

class PatchFamilyDto {
  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Enter a name or UPI handle' })
  name?: string;

  @Allow()
  @IsOptional()
  aliases?: string[] | string;

  @EmptyToUndefined()
  @IsOptional()
  @IsIn([...FAMILY_RELATIONS])
  relation?: string;
}

@Controller('family-members')
@UseGuards(JwtAuthGuard)
export class FamilyController {
  constructor(private family: FamilyService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.family.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: FamilyDto) {
    return this.family.create(user.userId, {
      name: dto.name,
      aliases: asAliases(dto.aliases),
      relation: dto.relation,
    });
  }

  @Patch(':id')
  update(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() dto: PatchFamilyDto) {
    return this.family.update(user.userId, id, {
      name: dto.name,
      aliases: dto.aliases != null ? asAliases(dto.aliases) : undefined,
      relation: dto.relation,
    });
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.family.remove(user.userId, id);
  }
}

function asAliases(raw?: string[] | string) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
