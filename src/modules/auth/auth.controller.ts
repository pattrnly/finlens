import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AuthService } from './auth.service';

class RegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

class GoogleDto {
  @IsString()
  @IsOptional()
  code?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private config: ConfigService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const out = await this.auth.register(dto.name, dto.email, dto.password);
    this.setRefresh(res, out.refreshToken);
    return { accessToken: out.accessToken, user: out.user };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const out = await this.auth.login(dto.email, dto.password);
    this.setRefresh(res, out.refreshToken);
    return { accessToken: out.accessToken, user: out.user };
  }

  @Post('refresh')
  async refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const raw = (req.cookies as Record<string, string> | undefined)?.refresh_token;
    if (!raw) throw new UnauthorizedException('No refresh token');
    const out = await this.auth.refresh(raw);
    this.setRefresh(res, out.refreshToken);
    return { accessToken: out.accessToken, user: out.user };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: { userId: string },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.auth.logout(user.userId);
    res.clearCookie('refresh_token', { path: '/api/v1/auth' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { userId: string }) {
    return this.auth.me(user.userId);
  }

  @Get('google')
  googleStart(@Res() res: FastifyReply) {
    const id = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!id) {
      return res.status(501).send({ message: 'Google OAuth is not configured' });
    }
    const redirect = this.config.get<string>('GOOGLE_CALLBACK_URL');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', id);
    url.searchParams.set('redirect_uri', redirect ?? '');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    return res.redirect(url.toString());
  }

  @Get('google/callback')
  async googleCallback(
    @Query() q: GoogleDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const id = this.config.get<string>('GOOGLE_CLIENT_ID');
    const secret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirect = this.config.get<string>('GOOGLE_CALLBACK_URL');
    const client = this.config.get<string>('CLIENT_URL', 'http://localhost:5173');
    if (!id || !secret || !q.code) {
      return res.redirect(`${client}/login?error=google`);
    }
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: q.code,
        client_id: id,
        client_secret: secret,
        redirect_uri: redirect ?? '',
        grant_type: 'authorization_code',
      }),
    });
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return res.redirect(`${client}/login?error=google`);
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = (await profileRes.json()) as {
      id: string;
      email: string;
      name: string;
    };
    const out = await this.auth.googleLogin(profile);
    this.setRefresh(res, out.refreshToken);
    return res.redirect(`${client}/auth/callback#token=${out.accessToken}`);
  }

  private setRefresh(res: FastifyReply, token: string) {
    res.setCookie('refresh_token', token, this.auth.cookieOptions());
  }
}
