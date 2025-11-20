import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InsightsService } from './insights.service';
import {
  InsightsBoardResponse,
  InsightsUpcomingEvent,
} from './insights.types';

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get('board')
  async getBoard(@Request() req: any): Promise<InsightsBoardResponse> {
    const userId = req?.user?.id;
    return this.insightsService.getBoardCard(userId);
  }

  @Get('board/upcoming')
  async getUpcomingEvents(
    @Request() req: any,
  ): Promise<InsightsUpcomingEvent[]> {
    const userId = req?.user?.id;
    return this.insightsService.listUpcomingEvents(userId);
  }
}
