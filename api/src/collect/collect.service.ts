import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Collect,
  CollectQueryParams,
  CollectListResponse,
  CollectStatusResponse,
} from './collect.types';

@Injectable()
export class CollectService {
  private readonly logger = new Logger(CollectService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 添加收藏（幂等）
   */
  async addCollect(
    userId: number,
    collectDto: { itemId: number },
  ): Promise<Collect> {
    try {
      const rawItemId = (collectDto as any)?.itemId;
      const itemId = parseInt(String(rawItemId), 10);
      if (!Number.isFinite(itemId)) {
        throw new HttpException('无效的商品ID', HttpStatus.BAD_REQUEST);
      }

      // 验证用户是否存在，避免外键错误导致 500
      const user = await (this.prisma as any).user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new HttpException('用户不存在或未登录', HttpStatus.UNAUTHORIZED);
      }

      // 幂等：先查是否存在
      const existing = await (this.prisma as any).collect.findUnique({
        where: { userId_itemId: { userId, itemId } },
      });
      if (existing) {
        return this.toCollect(existing);
      }

      const created = await (this.prisma as any).collect.create({
        data: { userId, itemId },
      });
      this.logger.log(`用户 ${userId} 收藏了好物 ${itemId}`);
      return this.toCollect(created);
    } catch (error) {
      this.logger.error('添加收藏失败', (error as any)?.stack || String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('添加收藏失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 取消收藏
   */
  async removeCollect(userId: number, itemId: number): Promise<void> {
    try {
      const existing = await (this.prisma as any).collect.findUnique({
        where: { userId_itemId: { userId, itemId } },
      });
      if (!existing) {
        throw new HttpException('该好物未收藏', HttpStatus.NOT_FOUND);
      }
      await (this.prisma as any).collect.delete({
        where: { userId_itemId: { userId, itemId } },
      });
      this.logger.log(`用户 ${userId} 取消收藏了好物 ${itemId}`);
    } catch (error) {
      this.logger.error('取消收藏失败', (error as any)?.stack || String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('取消收藏失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 获取用户收藏列表
   */
  async getUserCollects(
    userId: number,
    queryParams: CollectQueryParams,
  ): Promise<CollectListResponse> {
    try {
      const page = Math.max(1, queryParams.page ?? 1);
      const pageSize = Math.min(100, Math.max(1, queryParams.pageSize ?? 10));
      const skip = (page - 1) * pageSize;

      const where: any = { userId };
      if (queryParams.itemId) where.itemId = queryParams.itemId;

      const [rows, total] = await Promise.all([
        (this.prisma as any).collect.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        (this.prisma as any).collect.count({ where }),
      ]);

      return {
        data: rows.map((r: any) => this.toCollect(r)),
        meta: {
          pagination: {
            page,
            pageSize,
            pageCount: Math.ceil(total / pageSize),
            total,
          },
        },
      };
    } catch (error) {
      this.logger.error('获取收藏列表失败', (error as any)?.stack || String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('获取收藏列表失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 检查收藏状态
   */
  async checkCollectStatus(
    userId: number,
    itemId: number,
  ): Promise<CollectStatusResponse> {
    try {
      const existing = await (this.prisma as any).collect.findUnique({
        where: { userId_itemId: { userId, itemId } },
        select: { id: true },
      });
      return { isCollected: !!existing, collectId: existing?.id };
    } catch (error) {
      this.logger.error('检查收藏状态失败', (error as any)?.stack || String(error));
      throw new HttpException('检查收藏状态失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 获取收藏统计信息
   */
  async getCollectStats(userId: number): Promise<{ totalCount: number }> {
    try {
      const total = await (this.prisma as any).collect.count({ where: { userId } });
      return { totalCount: total };
    } catch (error) {
      this.logger.error('获取收藏统计失败', (error as any)?.stack || String(error));
      throw new HttpException('获取收藏统计失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private toCollect(row: any): Collect {
    return {
      id: row.id,
      userId: row.userId,
      itemId: row.itemId,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt ?? row.createdAt).toISOString(),
    };
  }
}