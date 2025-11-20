/**
 * @description 清洗和“拍平”之后，我们应用中使用的“好物”数据结构
 */
export interface FormattedItem {
  id: number;
  title: string;
  slogan: string;
  price: number;
  images: string[]; 
  detailImages: string[];
  story: string;
  isFeatured?: boolean; 
  coverUrl?: string; // 供前端卡片主图使用
}

/**
 * @description 清洗和“拍平”之后，我们应用中使用的“主题”数据结构
 */
export interface Theme {
  id: number;
  title: string;
  story: string;
  coverUrl: string; 
  updatedAt: string; 
  isPrivateBoard?: boolean; 
  items: FormattedItem[]; 
}