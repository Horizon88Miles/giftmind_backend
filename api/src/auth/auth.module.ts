import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HttpModule } from '@nestjs/axios';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { WechatService } from './wechat.service';

@Module({
  imports: [
    JwtModule.register({}), // 不设置默认 secret，让 AuthService 每次调用时显式指定
    PrismaModule,
    HttpModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, WechatService],
  exports: [JwtAuthGuard, AuthService],
})
export class AuthModule {}
