import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type UserSettingsPayload = {
  importantDateReminder: boolean;
  inspirationPush: boolean;
};

const DEFAULT_SETTINGS: UserSettingsPayload = {
  importantDateReminder: true,
  inspirationPush: false,
};

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: number): Promise<UserSettingsPayload> {
    try {
      const record = await (this.prisma as any).userSetting.findUnique({ where: { userId } });
      if (!record) {
        return { ...DEFAULT_SETTINGS };
      }
      return {
        importantDateReminder: !!record.importantDateReminder,
        inspirationPush: !!record.inspirationPush,
      };
    } catch (error) {
      if (this.isMissingTableError(error)) {
        this.logger.warn('user_settings 表不存在，返回默认设置');
        return { ...DEFAULT_SETTINGS };
      }
      throw error;
    }
  }

  async updateSettings(
    userId: number,
    payload: Partial<UserSettingsPayload>,
  ): Promise<UserSettingsPayload> {
    try {
      const record = await (this.prisma as any).userSetting.findUnique({ where: { userId } });
      const next: UserSettingsPayload = {
        importantDateReminder:
          payload.importantDateReminder ?? record?.importantDateReminder ?? DEFAULT_SETTINGS.importantDateReminder,
        inspirationPush:
          payload.inspirationPush ?? record?.inspirationPush ?? DEFAULT_SETTINGS.inspirationPush,
      };

      await (this.prisma as any).userSetting.upsert({
        where: { userId },
        update: {
          importantDateReminder: next.importantDateReminder,
          inspirationPush: next.inspirationPush,
        },
        create: {
          userId,
          importantDateReminder: next.importantDateReminder,
          inspirationPush: next.inspirationPush,
        },
      });

      return next;
    } catch (error) {
      if (this.isMissingTableError(error)) {
        this.logger.warn('user_settings 表不存在，更新操作跳过，返回默认设置');
        return { ...DEFAULT_SETTINGS };
      }
      throw error;
    }
  }

  private isMissingTableError(error: unknown): boolean {
    if (!error) {
      return false;
    }
    const err = error as any;
    if (err?.code === 'P2021' || err?.code === 'P2022') {
      return true;
    }
    const message = err?.message;
    return typeof message === 'string' && message.includes('user_settings');
  }
}
