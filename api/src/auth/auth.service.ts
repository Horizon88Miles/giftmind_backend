import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  id: number;
  phone: string;
  nickname?: string;
  gender?: boolean;
  meetDays?: number;
  avatarUrl?: string;
}

@Injectable()
export class AuthService {
  private static refreshStore = new Map<string, string>(); // 使用静态变量确保全局唯一
  private static accessTokenBlacklist = new Set<string>(); // 黑名单存储已登出的 access token

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // 确保用户存在（按手机号查找，不存在则创建），返回持久化后的用户基础信息
  async ensureUserByPhone(phone: string): Promise<{ id: number; phone: string; nickname?: string; gender?: boolean; meetDays: number; avatarUrl?: string }> {
    // 通过 any 访问以规避类型生成不同步导致的属性缺失诊断
    const user = await (this.prisma as any).user.upsert({
      where: { phone },
      update: {},
      create: {
        phone,
        nickname: '心礼用户',
        avatarUrl: '',
      },
    });
    return this.toUserPayload(user);
  }

  private computeMeetDays(createdAt: Date): number {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now.getTime() - created.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(1, days + 1); // 含注册当日，最少为1
  }

  private toUserPayload(user: any): { id: number; phone: string; nickname?: string; gender?: boolean; meetDays: number; avatarUrl?: string } {
    return {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname ?? '心礼用户',
      gender: user.gender ?? undefined,
      meetDays: this.computeMeetDays(user.createdAt),
      avatarUrl: user.avatarUrl ?? '',
    };
  }

  async updateProfile(
    userId: number,
    data: { nickname?: string; gender?: boolean; avatarUrl?: string; phone?: string },
  ) {
    const payload: Record<string, any> = {};
    if (typeof data.nickname === 'string') {
      payload.nickname = data.nickname;
    }
    if (typeof data.avatarUrl === 'string') {
      payload.avatarUrl = data.avatarUrl;
    }
    if (typeof data.gender === 'boolean') {
      payload.gender = data.gender;
    }
    if (typeof data.phone === 'string') {
      payload.phone = data.phone;
    }
    if (!Object.keys(payload).length) {
      return this.getUserById(userId);
    }
    const user = await (this.prisma as any).user.update({ where: { id: userId }, data: payload });
    return this.toUserPayload(user);
  }

  async getUserById(userId: number) {
    const user = await (this.prisma as any).user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.toUserPayload(user);
  }

  signAccessToken(payload: JwtPayload) {
    console.log('Signing access token for user:', payload.id);
    try {
      // 创建一个干净的 payload，排除 JWT 相关字段
      const cleanPayload = {
        id: payload.id,
        phone: payload.phone,
        nickname: payload.nickname,
        gender: payload.gender,
        meetDays: payload.meetDays,
        avatarUrl: payload.avatarUrl,
      };
      
      const token = this.jwtService.sign(cleanPayload, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN'),
      });
      console.log('Access token signed successfully');
      return token;
    } catch (error) {
      console.error('Error signing access token:', error.message);
      throw error;
    }
  }

  signRefreshToken(payload: JwtPayload) {
    try {
      console.log('Signing refresh token for user:', payload.id);
      const token = this.jwtService.sign(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN'),
      });
      console.log('Storing refresh token in refreshStore for user:', payload.id);
      AuthService.refreshStore.set(String(payload.id), token);
      console.log('RefreshStore size:', AuthService.refreshStore.size);
      console.log('RefreshStore contents:', Array.from(AuthService.refreshStore.keys()));
      return token;
    } catch (error) {
      console.error('Error signing refresh token:', error);
      throw error;
    }
  }

  verifyRefreshToken(token: string) {
    try {
      console.log('=== VERIFY REFRESH TOKEN START ===');
      console.log('Input token:', token ? token.substring(0, 50) + '...' : 'EMPTY');
      console.log('RefreshStore size:', AuthService.refreshStore.size);
      console.log('RefreshStore keys:', Array.from(AuthService.refreshStore.keys()));

      // 验证 JWT 签名和有效期
      console.log('Verifying JWT signature...');
      const payload = this.jwtService.verify(token, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
      console.log('JWT verification successful, payload:', payload);

      // 检查 refreshStore 中是否存在该用户的 token
      const stored = AuthService.refreshStore.get(String(payload.id));
      
      if (!stored) {
        console.log('No stored token found for user:', payload.id);
        return null;
      }
      
      const tokensMatch = stored === token;
      if (!tokensMatch) {
        console.log('Token mismatch - stored vs input token do not match');
        return null;
      }

      console.log('=== VERIFY REFRESH TOKEN SUCCESS ===');
      return payload;
    } catch (error) {
      console.error('=== VERIFY REFRESH TOKEN ERROR ===');
      console.error('Error verifying refresh token:', error.message);
      throw error;
    }
  }

  logout(userId: number) {
    console.log('Logging out user:', userId);
    AuthService.refreshStore.delete(String(userId));
    console.log('RefreshStore size after logout:', AuthService.refreshStore.size);
  }

  // 验证 access token 是否在黑名单中
  isAccessTokenBlacklisted(token: string): boolean {
    return AuthService.accessTokenBlacklist.has(token);
  }

  // 将 access token 添加到黑名单
  blacklistAccessToken(token: string) {
    AuthService.accessTokenBlacklist.add(token);
    console.log('Access token added to blacklist, blacklist size:', AuthService.accessTokenBlacklist.size);
  }
}
