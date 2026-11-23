import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private users: Model<UserDocument>,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(name: string, email: string, password: string) {
    const exists = await this.users.findOne({ email: email.toLowerCase() });
    if (exists) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.users.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
    });
    return this.issue(user);
  }

  async login(email: string, password: string) {
    const user = await this.users.findOne({ email: email.toLowerCase() });
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.issue(user);
  }

  async refresh(raw: string) {
    const hash = sha(raw);
    const user = await this.users.findOne({ refreshTokenHash: hash });
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    return this.issue(user);
  }

  async logout(userId: string) {
    await this.users.updateOne({ _id: userId }, { $unset: { refreshTokenHash: 1 } });
  }

  async me(userId: string) {
    return this.users.findById(userId);
  }

  async googleLogin(profile: { id: string; email: string; name: string }) {
    let user = await this.users.findOne({ googleId: profile.id });
    if (!user) {
      user = await this.users.findOne({ email: profile.email.toLowerCase() });
      if (user) {
        user.googleId = profile.id;
        await user.save();
      } else {
        user = await this.users.create({
          name: profile.name,
          email: profile.email.toLowerCase(),
          googleId: profile.id,
        });
      }
    }
    return this.issue(user);
  }

  cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.get('COOKIE_SECURE') === 'true',
      path: '/api/v1/auth',
      maxAge: ttlSeconds(this.config.get('JWT_REFRESH_TTL', '7d'), 7 * 24 * 3600),
    };
  }

  private async issue(user: UserDocument) {
    const accessToken = await this.jwt.signAsync({
      sub: String(user._id),
      email: user.email,
    });
    const refreshToken = randomBytes(48).toString('hex');
    user.refreshTokenHash = sha(refreshToken);
    await user.save();
    return {
      accessToken,
      refreshToken,
      user: user.toJSON(),
    };
  }
}

function sha(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

function ttlSeconds(raw: string | undefined, fallback: number) {
  const m = /^(\d+)\s*(ms|s|m|h|d)$/i.exec((raw ?? '').trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 'ms') return Math.max(1, Math.round(n / 1000));
  if (unit === 's') return n;
  if (unit === 'm') return n * 60;
  if (unit === 'h') return n * 3600;
  return n * 86400;
}
