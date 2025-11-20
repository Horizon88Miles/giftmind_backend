import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
  Patch,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ArchivesService } from './archives.service';
import { CreateArchiveDto } from './dtos/create-archive.dto';
import { UpdateArchiveDto } from './dtos/update-archive.dto';
import { Archive, RelationshipType } from './archives.types';

// 英文到中文的关系映射，便于兼容旧参数
const REL_EN_TO_ZH: Record<string, RelationshipType> = {
  family: RelationshipType.FAMILY,
  friend: RelationshipType.FRIEND,
  lover: RelationshipType.LOVER,
  colleague: RelationshipType.COLLEAGUE,
  other: RelationshipType.OTHER,
};

@Controller('archives')
@UseGuards(JwtAuthGuard)
export class ArchivesController {
  constructor(private readonly archivesService: ArchivesService) {}
  
  /**
   * 获取所有使用过的标签
   * GET /archives/tags
   */
  @Get('tags')
  async getAllTags(@Request() req) {
    const userId = req.user.id;
    return { tags: await this.archivesService.getAllTags(userId) };
  }

  /**
   * 重命名标签
   * PUT /archives/tags/:tag
   */
  @Put('tags/:tag')
  async renameTag(
    @Param('tag') oldTag: string,
    @Body() body: { newTag: string },
    @Request() req,
  ) {
    const userId = req.user.id;
    const success = await this.archivesService.renameTag(oldTag, body.newTag, userId);
    return { success, oldTag, newTag: body.newTag };
  }

  /**
   * 管理标签
   * PATCH /archives/:id/tags
   */
  @Patch(':id/tags')
  async manageTags(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: { tags: string[] },
    @Request() req,
  ): Promise<Archive> {
    const userId = req.user.id;
    return this.archivesService.updateArchiveTags(id, data.tags, userId);
  }

  /**
   * 获取当前用户的所有档案
   * GET /archives?page=1&limit=10&sortField=createdAt&sortOrder=desc
   */
  @Get()
  async getMyArchives(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    const userId = req.user.id;
    return this.archivesService.getArchivesByUserId(
      userId,
      page ? parseInt(page as any, 10) : undefined,
      limit ? parseInt(limit as any, 10) : undefined,
      sortField,
      sortOrder,
    );
  }

  /**
   * 根据ID获取单个档案详情
   * GET /archives/:id
   */
  @Get(':id')
  async getArchiveById(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<Archive | null> {
    const userId = req.user.id;
    return this.archivesService.getArchiveById(id, userId);
  }

  /**
   * 创建新的档案
   * POST /archives
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createArchive(
    @Body() createArchiveDto: CreateArchiveDto,
    @Request() req,
  ): Promise<Archive> {
    const userId = req.user.id;
    return this.archivesService.createArchive(createArchiveDto, userId);
  }

  /**
   * 更新档案信息
   * PUT /archives/:id
   */
  @Put(':id')
  async updateArchive(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateArchiveDto: UpdateArchiveDto,
    @Request() req,
  ): Promise<Archive> {
    const userId = req.user.id;
    return this.archivesService.updateArchive(id, updateArchiveDto, userId);
  }

  /**
   * 删除档案
   * DELETE /archives/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteArchive(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<void> {
    const userId = req.user.id;
    return this.archivesService.deleteArchive(id, userId);
  }

  /**
   * 根据关系类型筛选档案
   * GET /archives/filter/relationship?type=friend | 亲人
   */
  @Get('filter/relationship')
  async getArchivesByRelationship(
    @Query('type') relationshipType: string,
    @Request() req,
  ): Promise<Archive[]> {
    const userId = req.user.id;
    const { data: allArchives } = await this.archivesService.getArchivesByUserId(userId);
    
    if (!relationshipType) {
      return allArchives;
    }

    const raw = String(relationshipType).trim().toLowerCase();
    const zh = REL_EN_TO_ZH[raw] ?? (relationshipType as RelationshipType);
    
    return allArchives.filter(archive => {
      const rel = String(archive.relationship ?? '').trim().toLowerCase();
      const archiveZh = (REL_EN_TO_ZH[rel] ?? archive.relationship) as RelationshipType;
      return archiveZh === zh;
    });
  }

  /**
   * 根据标签筛选档案
   * GET /archives/filter/tags?tags=生日,节日
   */
  @Get('filter/tags')
  async getArchivesByTags(
    @Query('tags') tags: string,
    @Request() req,
  ): Promise<Archive[]> {
    const userId = req.user.id;
    const { data: allArchives } = await this.archivesService.getArchivesByUserId(userId);
    
    if (!tags) {
      return allArchives;
    }
    
    const tagArray = tags.split(',').map(tag => tag.trim());
    
    return allArchives.filter(archive => {
      if (!archive.tag || archive.tag.length === 0) {
        return false;
      }
      
      return tagArray.some(searchTag => 
        archive.tag!.some(archiveTag => 
          archiveTag.toLowerCase().includes(searchTag.toLowerCase())
        )
      );
    });
  }

  /**
   * 搜索档案（按姓名或事件名称/日期）
   * GET /archives/search?q=张三
   */
  @Get('search')
  async searchArchives(
    @Query('q') query: string,
    @Request() req,
  ): Promise<Archive[]> {
    const userId = req.user.id;
    const { data: allArchives } = await this.archivesService.getArchivesByUserId(userId);

    if (!query) {
      return allArchives;
    }

    const q = query.trim().toLowerCase();

    return allArchives.filter(archive => {
      const inName = archive.name.toLowerCase().includes(q);

      const inEvents = archive.events?.some(ev => {
        return (
          ev.name.toLowerCase().includes(q) ||
          ev.date.toLowerCase().includes(q)
        );
      });

      return inName || inEvents;
    });
  }
}