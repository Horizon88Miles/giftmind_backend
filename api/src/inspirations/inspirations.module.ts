import { Module } from '@nestjs/common';
import { InspirationsController } from './inspirations.controller';
import { InspirationsService } from './inspirations.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [InspirationsController],
  providers: [InspirationsService],
  exports: [InspirationsService]
})
export class InspirationsModule {}
