/**
 * 关系类型枚举
 */
export enum RelationshipType {
  FAMILY = '亲人',
  FRIEND = '朋友', 
  LOVER = '恋人',
  COLLEAGUE = '同事',
  OTHER = '其他'
}

/**
 * 心礼档案数据结构 - 后端标准返回结构
 */
export interface EventItem {
  name: string; // 事件名称，如 'birthday'、'anniversary'
  date: string; // 月-日字符串（如 'MM-DD' 或 'X月X日'）
}

export interface Archive {
  id: number;
  userId: number;
  name: string;
  relationship: RelationshipType;
  events: EventItem[]; // 多个事件
  tag: string[]; // JSON 数组
  createdAt: string;
  updatedAt: string;
}

/**
 * 创建档案时的数据结构（不包含自动生成的字段）
 */
export interface CreateArchiveData {
  name: string;
  relationship: RelationshipType;
  events: EventItem[]; // 至少一个事件
  tag?: string[];
  userId: number; // 关联的用户ID
}

/**
 * 更新档案时的数据结构（所有字段都是可选的）
 */
export interface UpdateArchiveData {
  name?: string;
  relationship?: RelationshipType;
  events?: EventItem[];
  tag?: string[];
}