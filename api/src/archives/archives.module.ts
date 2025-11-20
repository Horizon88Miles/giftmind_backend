import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { ArchivesController } from './archives.controller';
import { ArchivesService } from './archives.service';

@Module({
  imports: [
    PrismaModule,    // 引入 Prisma 用于数据库访问
    ConfigModule,    // 用于读取配置文件
    AuthModule,      // 引入 AuthModule 以便 JwtAuthGuard 注入依赖
  ],
  controllers: [ArchivesController],
  providers: [ArchivesService],
  exports: [ArchivesService],  // 导出 Service，供其他模块使用
})
export class ArchivesModule {}