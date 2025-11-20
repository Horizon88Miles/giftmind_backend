import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InspirationsService } from './inspirations.service';
import { FormattedItem, Theme } from './inspirations.types';

// 定义统一的API响应结构
interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

// 定义首页接口返回的数据内容类型
interface HomePageData {
  privateBoard: Theme | null;
  featuredItems: FormattedItem[];
  weeklyThemes: Theme[];
}

@Controller('inspirations')
export class InspirationsController {
  constructor(
    private readonly inspirationsService: InspirationsService,
  ) {}

  /**
   * @description [最优解] 获取 [灵感] 首页所需的全部聚合数据
   * @route GET /inspirations/home
   */
  @Get('home')
  async getHomePageData(): Promise<ApiResponse<HomePageData>> {
    try {
      // 直接调用Service层那个强大的聚合方法
      const homePageData = await this.inspirationsService.getHomePageData();

      return {
        code: 200,
        message: '获取首页数据成功',
        data: homePageData,
      };
    } catch (error) {
      console.error('Error in getHomePageData Controller:', error);
      throw new HttpException(
        '获取首页数据失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @description 根据ID获取单个主题的详细信息
   * @route GET /inspirations/themes/:id
   */
  @Get('themes/:id')
  async getThemeDetail(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<Theme>> {
    try {
      const theme = await this.inspirationsService.getThemeById(id);

      if (!theme) {
        // Service返回null，Controller就抛出404异常
        throw new NotFoundException(`ID为 ${id} 的主题不存在`);
      }

      return {
        code: 200,
        message: '获取主题详情成功',
        data: theme,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error(`Error fetching theme detail for id ${id}:`, error);
      throw new HttpException(
        '获取主题详情失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @description 获取好物列表
   * @route GET /inspirations/items
   * @query isFeatured: boolean 可选，筛选精选好物
   */
  @Get('items')
  async getItems(): Promise<ApiResponse<FormattedItem[]>> {
    try {
      const items = await this.inspirationsService.getItemsList();
      return {
        code: 200,
        message: '获取成功',
        data: items,
      };
    } catch (error) {
      console.error('Error in getItems Controller:', error);
      throw new HttpException('获取好物列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * @description 根据ID获取单个好物的详细信息
   * @route GET /inspirations/items/:id
   */
  @Get('items/:id')
  async getItemDetail(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<FormattedItem>> {
    try {
      const item = await this.inspirationsService.getItemById(id);

      if (!item) {
        // Service返回null，Controller就抛出404异常
        throw new NotFoundException(`ID为 ${id} 的好物不存在`);
      }

      return {
        code: 200,
        message: '获取成功',
        data: item,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error(`Error fetching item detail for id ${id}:`, error);
      throw new HttpException(
        '获取好物详情失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}