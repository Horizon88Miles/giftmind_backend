import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 信任代理，让 req.protocol 能正确反映 HTTPS
  app.set('trust proxy', true);
  
  // 全局开启请求体验证与类型转换
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // 开启 CORS
  app.enableCors();
  // 支持通过环境变量配置端口，默认 3000
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
}
bootstrap();
