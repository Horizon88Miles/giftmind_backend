import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CollectService } from './collect.service';
import { CreateCollectDto } from './dtos/create-collect.dto';
import { CollectQueryDto } from './dtos/collect-query.dto';
import {
  CollectListResponse,
  CollectStatusResponse,
} from './collect.types';

@Controller('collect')
@UseGuards(JwtAuthGuard)
export class CollectController {
  constructor(private readonly collectService: CollectService) {}

  /**
   * 添加收藏
   * POST /collect
   */
  @Post()
  async addCollect(
    @Body() createCollectDto: CreateCollectDto,
    @Request() req: any,
  ): Promise<{ message: string; data: any }> {
    try {
      const userId = req.user.id;
      const result = await this.collectService.addCollect(
        userId,
        createCollectDto,
      );

      return {
        message: '收藏成功',
        data: result,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        '添加收藏失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 取消收藏
   * DELETE /collect/:itemId
   */
  @Delete(':itemId')
  async removeCollect(
    @Param('itemId') itemId: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    try {
      const userId = req.user.id;
      const itemIdNumber = parseInt(itemId, 10);

      if (isNaN(itemIdNumber)) {
        throw new HttpException('无效的商品ID', HttpStatus.BAD_REQUEST);
      }

      await this.collectService.removeCollect(userId, itemIdNumber);

      return {
        message: '取消收藏成功',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        '取消收藏失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取用户收藏列表
   * GET /collect
   */
  @Get()
  async getCollectList(
    @Query() query: CollectQueryDto,
    @Request() req: any,
  ): Promise<CollectListResponse> {
    try {
      const userId = req.user.id;
      return await this.collectService.getUserCollects(userId, query);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        '获取收藏列表失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 检查收藏状态
   * GET /collect/status/:itemId
   */
  @Get('status/:itemId')
  async getCollectStatus(
    @Param('itemId') itemId: string,
    @Request() req: any,
  ): Promise<CollectStatusResponse> {
    try {
      const userId = req.user.id;
      const itemIdNumber = parseInt(itemId, 10);

      if (isNaN(itemIdNumber)) {
        throw new HttpException('无效的商品ID', HttpStatus.BAD_REQUEST);
      }

      return await this.collectService.checkCollectStatus(userId, itemIdNumber);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        '检查收藏状态失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取收藏统计信息
   * GET /collect/stats
   */
  @Get('stats')
  async getCollectStats(
    @Request() req: any,
  ): Promise<{ totalCount: number }> {
    try {
      const userId = req.user.id;
      return await this.collectService.getCollectStats(userId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        '获取收藏统计失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}