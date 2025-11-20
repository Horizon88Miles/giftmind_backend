import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Archive, EventItem } from './archives.types';
import { CreateArchiveDto } from './dtos/create-archive.dto';
import { UpdateArchiveDto } from './dtos/update-archive.dto';

type ArchiveRecord = {
  id: number;
  userId: number;
  name: string;
  relationship: string;
  event?: string;
  date?: Date | string;
  events?: EventItem[] | any;
  tag?: string[];
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ArchivesService {
  private readonly archiveModel: any;

  constructor(private readonly prisma: PrismaService) {
    this.archiveModel = (prisma as any).archive;
  }

  /**
   * 将 Prisma 记录映射为前端约定的 Archive 结构
   */
  private formatMonthDay(input: Date | string): string {
    const d = input instanceof Date ? input : new Date(input);
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${mm}-${dd}`;
  }

  private parseDateInput(input: string): Date {
    const mmdd = input.match(/^(\d{2})-(\d{2})$/);
    if (mmdd) {
      const m = parseInt(mmdd[1], 10);
      const d = parseInt(mmdd[2], 10);
      return new Date(Date.UTC(2000, m - 1, d));
    }
    const zh = input.match(/^(\d{1,2})月(\d{1,2})日$/);
    if (zh) {
      const m = parseInt(zh[1], 10);
      const d = parseInt(zh[2], 10);
      return new Date(Date.UTC(2000, m - 1, d));
    }
    const dt = new Date(input);
    if (isNaN(dt.getTime())) {
      throw new Error('无效的日期格式');
    }
    return dt;
  }

  private toApiArchive(record: ArchiveRecord): Archive {
    const events: EventItem[] = Array.isArray(record.events) && record.events.length > 0
      ? record.events.map((e: any) => ({ name: String(e.name), date: String(e.date) }))
      : (record.event && record.date
          ? [{ name: record.event, date: this.formatMonthDay(record.date) }]
          : []);

    return {
      id: record.id,
      userId: record.userId,
      name: record.name,
      relationship: record.relationship as any,
      events,
      tag: record.tag ?? [],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * 获取用户的所有档案
   * @param userId 用户ID
   * @param page 页码，默认为1
   * @param limit 每页数量，默认为10
   * @param sortField 排序字段，默认为createdAt
   * @param sortOrder 排序方向，默认为desc
   */
  async getArchivesByUserId(
    userId: number, 
    page: number = 1, 
    limit: number = 10,
    sortField: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<{ data: Archive[]; meta: { total: number; page: number; pageSize: number; pageCount: number } }> {
    try {
      const validSortFields = ['createdAt', 'updatedAt', 'name', 'relationship'];
      const actualSortField = validSortFields.includes(sortField) ? sortField : 'createdAt';
      const skip = Math.max(0, (page - 1) * limit);
      const take = Math.max(1, limit);
      const orderBy: any = { [actualSortField]: sortOrder };

      const [total, rows] = await Promise.all([
        this.archiveModel.count({ where: { userId } }),
        this.archiveModel.findMany({
          where: { userId },
          orderBy,
          skip,
          take,
        }),
      ]);

      return {
        data: rows.map(r => this.toApiArchive(r)),
        meta: {
          total,
          page,
          pageSize: limit,
          pageCount: Math.ceil(total / limit) || 0,
        },
      };
    } catch (error) {
      console.error('Error fetching archives:', (error as any)?.message || error);
      return { data: [], meta: { total: 0, page, pageSize: limit, pageCount: 0 } };
    }
  }

  /**
   * 根据ID获取单个档案
   */
  async getArchiveById(id: number, userId: number): Promise<Archive | null> {
    try {
      const record = await this.archiveModel.findUnique({ where: { id } });
      if (!record) return null;
      if (record.userId !== userId) {
        throw new NotFoundException('档案不存在或无权访问');
      }
      return this.toApiArchive(record);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      console.error(`Error fetching archive ${id}:`, (error as any)?.message || error);
      return null;
    }
  }

  /**
   * 创建新档案
   */
  async createArchive(createArchiveDto: CreateArchiveDto, userId: number): Promise<Archive> {
    try {
      const first = createArchiveDto.events?.[0];
      const created = await this.archiveModel.create({
        data: {
          userId,
          name: createArchiveDto.name,
          relationship: createArchiveDto.relationship,
          events: createArchiveDto.events,
          // 兼容旧字段：写入首事件
          event: first?.name,
          date: first?.date ? this.parseDateInput(first.date) : undefined,
          tag: createArchiveDto.tag ?? [],
        },
      });
      return this.toApiArchive(created);
    } catch (error) {
      console.error('Error creating archive:', (error as any)?.message || error);
      throw new Error('创建档案失败');
    }
  }

  /**
   * 更新档案
   */
  async updateArchive(id: number, updateArchiveDto: UpdateArchiveDto, userId: number): Promise<Archive> {
    const existingArchive = await this.getArchiveById(id, userId);
    if (!existingArchive) {
      throw new NotFoundException('档案不存在或无权访问');
    }
    try {
      const first = updateArchiveDto.events?.[0];
      const updated = await this.archiveModel.update({
        where: { id },
        data: {
          name: updateArchiveDto.name,
          relationship: updateArchiveDto.relationship,
          events: updateArchiveDto.events,
          // 兼容旧字段：写入首事件（如提供）
          event: first?.name,
          date: first?.date ? this.parseDateInput(first.date) : undefined,
          tag: updateArchiveDto.tag,
        },
      });
      return this.toApiArchive(updated);
    } catch (error) {
      console.error(`Error updating archive ${id}:`, (error as any)?.message || error);
      throw new Error('更新档案失败');
    }
  }

  /**
   * 删除档案
   */
  async deleteArchive(id: number, userId: number): Promise<void> {
    // 先验证档案是否存在且属于当前用户
    const existingArchive = await this.getArchiveById(id, userId);
    if (!existingArchive) {
      throw new NotFoundException('档案不存在或无权访问');
    }
    try {
      await this.archiveModel.delete({ where: { id } });
    } catch (error) {
      console.error(`Error deleting archive ${id}:`, (error as any)?.message || error);
      throw new Error('删除档案失败');
    }
  }

  /**
   * 获取用户所有使用过的标签
   */
  async getAllTags(userId: number): Promise<string[]> {
    try {
      const rows = await this.archiveModel.findMany({
        where: { userId },
        select: { tag: true },
      });
      const allTags = new Set<string>();
      rows.forEach(row => {
        (row.tag || []).forEach(t => allTags.add(t));
      });
      return Array.from(allTags).sort();
    } catch (error) {
      console.error('Error fetching tags:', (error as any)?.message || error);
      return [];
    }
  }

  /**
   * 重命名标签
   */
  async renameTag(oldTag: string, newTag: string, userId: number): Promise<boolean> {
    try {
      const items = await this.archiveModel.findMany({
        where: { userId, tag: { has: oldTag } },
        select: { id: true, tag: true },
      });
      await Promise.all(
        items.map(item =>
          this.archiveModel.update({
            where: { id: item.id },
            data: { tag: (item.tag || []).map(t => (t === oldTag ? newTag : t)) },
          })
        )
      );
      return true;
    } catch (error) {
      console.error(`Error renaming tag from ${oldTag} to ${newTag}:`, (error as any)?.message || error);
      return false;
    }
  }
  
  /**
   * 更新档案标签
   */
  async updateArchiveTags(id: number, tags: string[], userId: number): Promise<Archive> {
    // 先验证档案是否存在且属于当前用户
    const existingArchive = await this.archiveModel.findUnique({ where: { id } });
    if (!existingArchive || existingArchive.userId !== userId) {
      throw new NotFoundException('档案不存在或无权访问');
    }

    const updated = await this.archiveModel.update({
      where: { id },
      data: { tag: tags ?? [] },
    });
    return this.toApiArchive(updated);
  }
}