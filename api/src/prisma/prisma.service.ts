import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch {
      // 数据库连接失败时忽略，业务侧将进行降级兜底
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch {
      // 断开失败忽略
    }
  }
}