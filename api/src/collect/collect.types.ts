/**
 * 收藏模块类型定义（Postgres / Prisma）
 */

export interface Collect {
  id: number;
  userId: number;
  itemId: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectQueryParams {
  userId?: number;
  itemId?: number;
  page?: number;
  pageSize?: number;
}

export interface CollectListResponse {
  data: Collect[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

export interface CollectStatusResponse {
  isCollected: boolean;
  collectId?: number;
}