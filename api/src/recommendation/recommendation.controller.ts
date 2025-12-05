import { Body, Controller, HttpException, HttpStatus, Post, UseGuards, Request } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { AnalyzeNiuDto } from './dtos/niu.dto';
import { PlanGiftDto } from './dtos/plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from '../chat/chat.service';

@Controller('recommendation')
export class RecommendationController {
  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly chatService: ChatService,
  ) {}

  /**
   * 意图识别与槽位抽取
   */
  @UseGuards(JwtAuthGuard)
  @Post('analyze')
  async analyze(@Body() dto: AnalyzeNiuDto, @Request() req: any) {
    try {
      const result = await this.recommendationService.analyzeInput(dto);
      return { code: 200, message: 'OK', data: result };
    } catch (e) {
      throw new HttpException('分析失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 端到端推荐：输入自然语言返回商品列表与理由
   */
  @UseGuards(JwtAuthGuard)
  @Post('recommend')
  async recommend(@Body() dto: AnalyzeNiuDto, @Request() req: any) {
    try {
      const result = await this.recommendationService.recommendFromInput(dto);
      const userId = req?.user?.id;
      const sessionId = dto.conversationId;

      // 将推荐结果作为一条助手消息保存到聊天历史
      await this.chatService.appendAssistantMessage(userId, sessionId, {
        type: 'recommendation',
        version: 1,
        intent: result.intent,
        slots: result.slots,
        items: result.items,
        explanations: result.explanations,
      });
      return { code: 200, message: 'OK', data: result };
    } catch (e) {
      throw new HttpException('推荐失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('plan')
  async plan(@Body() dto: PlanGiftDto, @Request() req: any) {
    try {
      const plan = await this.recommendationService.generatePlanForItem(dto);
      const userId = req?.user?.id;
      const sessionId = dto.conversationId;
      await this.chatService.appendAssistantMessage(userId, sessionId, {
        type: 'planning',
        version: 1,
        itemId: dto.itemId,
        itemTitle: dto.itemTitle,
        itemPrice: dto.itemPrice,
        itemSlogan: dto.itemSlogan,
        itemDescription: dto.itemDescription,
        itemCover: dto.itemCover,
        plan,
      });
      return { code: 200, message: 'OK', data: plan };
    } catch (e) {
      throw new HttpException('生成策划失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

}
