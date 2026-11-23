import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { EmptyToUndefined } from '../../common/empty-to-undefined';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CATEGORY_KINDS } from '../../common/types';
import { CategoriesService } from './categories.service';

class CategoryDto {
  @IsString()
  name: string;

  @IsIn([...CATEGORY_KINDS])
  kind: string;

  @IsOptional()
  @IsString()
  color?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  parentId?: string;
}

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.categories.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CategoryDto) {
    return this.categories.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: Partial<CategoryDto>,
  ) {
    return this.categories.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.categories.remove(user.userId, id);
  }
}
