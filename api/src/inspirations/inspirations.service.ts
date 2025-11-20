import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { FormattedItem, Theme } from './inspirations.types';

@Injectable()
export class InspirationsService {
  constructor(private readonly httpService: HttpService) {}

  private readonly strapiUrl = 'http://localhost:1337/api';

  /**
   * @description 终极版、更健壮的Strapi数据清洗函数，能处理深度嵌套和图片路径
   * @param data Strapi返回的任何数据结构
   * @returns 清洗和“拍平”后的干净数据
   */
  private formatStrapiResponse(data: any): any {
    // 基础情况：如果不是对象或数组，直接返回
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    // 情况1: 如果是数组，递归处理数组中的每一项
    if (Array.isArray(data)) {
      return data.map(item => this.formatStrapiResponse(item));
    }

    // 从这里开始，我们确定data是一个对象
    
    // 情况2: 如果是Strapi的标准API响应外壳 { data: ..., meta: ... }
    // 或者任何形式的 { data: ... } 嵌套，我们直接深入到 data 内部
    if ('data' in data && data.data !== undefined) { // 确保data字段存在且不为null
      return this.formatStrapiResponse(data.data);
    }
    
    // 情况3: 如果是Strapi的实体结构 { id: ..., attributes: ... }
    if ('id' in data && 'attributes' in data) {
      const attributes = this.formatStrapiResponse(data.attributes); // 递归清洗 attributes
      return {
        id: data.id,
        ...attributes,
      };
    }
    
    // 情况4: 如果它本身就是一个 attributes 对象，或者一个普通的嵌套对象
    // 遍历它的所有key，并递归清洗它的值
    const newObj: { [key: string]: any } = {};
    for (const key in data) {
      newObj[key] = this.formatStrapiResponse(data[key]);
    }

    // ★★★ 核心升级：在最后一步，检查清洗后的对象是否是图片 ★★★
    // Strapi 图片字段可能是 { data: { attributes: { url }}} 或者数组
    // 我们统一“拍平”为字符串 URL 或字符串数组
    if (newObj) {
      // 单图：{ url: string }
      if (typeof newObj.url === 'string') {
        let url: string = newObj.url;
        if (url.startsWith('/')) {
          url = `http://localhost:1337${url}`;
        }
        return url; // 将整个图片对象替换为绝对URL字符串
      }

      // 多图：{ images: [{ url } ...] } 或已经是数组
      if (Array.isArray(newObj.images)) {
        newObj.images = newObj.images.map((img: any) => {
          const u = typeof img === 'string' ? img : img?.url;
          if (!u) return '';
          return u.startsWith('/') ? `http://localhost:1337${u}` : u;
        }).filter(Boolean);
      }

      // 详情图
      if (Array.isArray(newObj.detailImages)) {
        newObj.detailImages = newObj.detailImages.map((img: any) => {
          const u = typeof img === 'string' ? img : img?.url;
          if (!u) return '';
          return u.startsWith('/') ? `http://localhost:1337${u}` : u;
        }).filter(Boolean);
      }

      // 主题封面
      if (typeof newObj.coverUrl === 'string') {
        if (newObj.coverUrl.startsWith('/')) {
          newObj.coverUrl = `http://localhost:1337${newObj.coverUrl}`;
        }
      } else if (newObj.coverUrl?.url) {
        const u = newObj.coverUrl.url;
        newObj.coverUrl = u.startsWith('/') ? `http://localhost:1337${u}` : u;
      }

      // 为好物自动生成主图 coverUrl：优先 images，其次 detailImages
      if (!newObj.coverUrl && Array.isArray(newObj.images) && newObj.images.length > 0) {
        newObj.coverUrl = newObj.images[0];
      }
      if (!newObj.coverUrl && Array.isArray(newObj.detailImages) && newObj.detailImages.length > 0) {
        newObj.coverUrl = newObj.detailImages[0];
      }
    }
    
    return newObj;
  }
  
  /**
   * @description [核心] 获取 [灵感] 首页所需的全部聚合数据
   */
  async getHomePageData(): Promise<{
    privateBoard: Theme | null;
    featuredItems: FormattedItem[];
    weeklyThemes: Theme[];
  }> {
    try {
      // 1. 并行获取所有需要的基础数据
      const [themesResponse, itemsResponse] = await Promise.all([
        firstValueFrom(this.httpService.get<any>(`${this.strapiUrl}/themes`, { 
          params: { 
            populate: {
              coverUrl: true,
              items: { // 深度填充items内部的images字段
                populate: {
                  images: true
                }
              }
            }
          } 
        })),
        firstValueFrom(this.httpService.get<any>(`${this.strapiUrl}/items`, { 
          params: { 
            'filters[isFeatured][$eq]': true,
            populate: ['images', 'detailImages'] 
          } 
        }))
      ]);

      // 2. 清洗原始数据
      const allThemes: Theme[] = this.formatStrapiResponse(themesResponse.data);
      const allItems: FormattedItem[] = this.formatStrapiResponse(itemsResponse.data);

      // 3. 在后端执行所有业务逻辑
      allThemes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      const featuredItems = allItems;
      const privateBoard = allThemes.find(theme => theme.isPrivateBoard === true) || (allThemes.length > 0 ? allThemes[0] : null);
      const weeklyThemes = allThemes.filter(theme => theme.id !== privateBoard?.id);
      
      // 4. 组合成最终的、干净的数据结构返回给Controller
      return {
        privateBoard,
        featuredItems,
        weeklyThemes,
      };

    } catch (e) {
      const error: any = e;
      console.error('Error fetching home page data:', error?.response?.data || error?.message || error);
      return { privateBoard: null, featuredItems: [], weeklyThemes: [] };
    }
  }

  /**
   * @description 根据ID获取单个好物的详细信息
   */
  async getItemById(id: number): Promise<FormattedItem | null> {
    const populate: any = {
      images: true,
      detailImages: true,
    };

    // 首选：用列表接口按 id 精确过滤获取第一条（避免 v5 下 /items/:id 的 404 噪音）
    try {
      const responseById = await firstValueFrom(
        this.httpService.get<any>(`${this.strapiUrl}/items`, {
          params: {
            'filters[id][$eq]': id,
            populate,
            'pagination[pageSize]': 1,
          },
        }),
      );
      const list = this.formatStrapiResponse(responseById.data);
      if (Array.isArray(list) && list.length > 0) {
        return list[0];
      }
    } catch (e) {
      const error: any = e;
      console.error(`Error fetching item (filter by id) with ID ${id}:`, error?.response?.data || error?.message || error);
    }

    // 兜底：按 slug 精确匹配
    try {
      const slug = String(id);
      const responseBySlug = await firstValueFrom(
        this.httpService.get<any>(`${this.strapiUrl}/items`, {
          params: {
            'filters[slug][$eq]': slug,
            populate,
            'pagination[pageSize]': 1,
          },
        }),
      );
      const listBySlug = this.formatStrapiResponse(responseBySlug.data);
      if (Array.isArray(listBySlug) && listBySlug.length > 0) {
        return listBySlug[0];
      }
    } catch (e) {
      const error: any = e;
      console.error(`Error fetching item (fallback by slug) with slug ${String(id)}:`, error?.response?.data || error?.message || error);
    }

    return null;
  }
  
  async getItemsList(options?: { isFeatured?: boolean }): Promise<FormattedItem[]> {
    try {
      const params: any = { populate: ['images', 'detailImages'] };
      if (typeof options?.isFeatured === 'boolean') {
        params['filters[isFeatured][$eq]'] = options.isFeatured;
      }
      const response = await firstValueFrom(
        this.httpService.get<any>(`${this.strapiUrl}/items`, { params })
      );
      const items: FormattedItem[] = this.formatStrapiResponse(response.data);
      return items;
    } catch (e) {
      const error: any = e;
      console.error('Error fetching items list:', error?.response?.data || error?.message || error);
      return [];
    }
  }
  /**
   * @description 获取所有主题
   */
  async getThemeById(id: number): Promise<Theme | null> {
    // 统一、正确的 populate 配置（修正了之前的写法与拼写）
    const populate: any = {
      coverUrl: true,
      items: {
        populate: {
          images: true,
          detailImages: true,
        },
      },
    };

    // 1) 首选：按 Strapi findOne /themes/:id 查询（若 Strapi 能正常按 id 查到会最快）
    try {
      const response = await firstValueFrom(
        this.httpService.get<any>(`${this.strapiUrl}/themes/${id}`, {
          params: { populate },
        })
      );
      const theme = this.formatStrapiResponse(response.data);
      if (theme) return theme;
    } catch (e) {
      // 404 时走兜底，不打印噪音日志；其它错误保留日志
      if (e?.response?.status !== 404) {
        const error: any = e;
        console.error(`Error fetching theme (findOne) with ID ${id}:`, error?.response?.data || error?.message || error);
      }
    }

    // 2) 兜底一：用列表接口按 id 精确过滤获取第一条（你已验证此方式可用）
    try {
      const responseById = await firstValueFrom(
        this.httpService.get<any>(`${this.strapiUrl}/themes`, {
          params: {
            'filters[id][$eq]': id,
            populate,
            'pagination[pageSize]': 1,
          },
        })
      );
      const list = this.formatStrapiResponse(responseById.data);
      if (Array.isArray(list) && list.length > 0) {
        return list[0];
      }
    } catch (e) {
      const error: any = e;
      console.error(`Error fetching theme (filter by id) with ID ${id}:`, error?.response?.data || error?.message || error);
    }

    // 3) 兜底二：按 slug 精确匹配（最小改动：不改 Controller，若前端未来传 slug，也可复用该逻辑）
    try {
      const slug = String(id);
      const responseBySlug = await firstValueFrom(
        this.httpService.get<any>(`${this.strapiUrl}/themes`, {
          params: {
            'filters[slug][$eq]': slug,
            populate,
            'pagination[pageSize]': 1,
          },
        })
      );
      const listBySlug = this.formatStrapiResponse(responseBySlug.data);
      if (Array.isArray(listBySlug) && listBySlug.length > 0) {
        return listBySlug[0];
      }
    } catch (e) {
      const error: any = e;
      console.error(`Error fetching theme (fallback by slug) with slug ${String(id)}:`, error?.response?.data || error?.message || error);
    }

    return null;
  }
}