import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { UsersService } from './users.service';

class PrefsDto {
  @IsOptional()
  @IsIn(['dark', 'light'])
  theme?: string;

  @IsOptional()
  @IsMongoId()
  defaultAccountId?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: { userId: string }) {
    return this.users.findById(user.userId);
  }

  @Patch('me')
  update(@CurrentUser() user: { userId: string }, @Body() dto: PrefsDto) {
    return this.users.updatePrefs(user.userId, dto as Record<string, unknown>);
  }
}
