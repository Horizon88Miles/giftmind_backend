import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InspirationsModule } from './inspirations/inspirations.module';
import { AuthModule } from './auth/auth.module';
import { ArchivesModule } from './archives/archives.module';
import { CollectModule } from './collect/collect.module';
import { ChatModule } from './chat/chat.module';
import { RecommendationModule } from './recommendation/recommendation.module';
import { InsightsModule } from './insights/insights.module';
import { UserModule } from './user/user.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    InspirationsModule,
    AuthModule,
    ArchivesModule,
    CollectModule,
    ChatModule,
    RecommendationModule,
    InsightsModule,
    UserModule,
    UploadModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
