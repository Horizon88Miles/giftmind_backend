//定义一个消息对象的结构
export interface Message {
  id: string;
  sessionId: string; // 所属会话ID
  content: string | object;
  role: 'user' | 'assistant' | 'system';
  createdAt: Date;
}

//定义一个会话对象的结构
export interface Session {
  id: string;
  userId: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PriorityEntrySource = 'reminder' | 'item' | 'theme';
export type PriorityEntryDetail =
  | 'xiaoxiboard'
  | 'item_detail'
  | 'theme_detail'
  | 'giftmind_tab'
  | 'other';

export interface PrioritySlotStatus {
  targetFilled?: boolean;
  relationshipFilled?: boolean;
  eventFilled?: boolean;
  budgetFilled?: boolean;
  interestsFilled?: boolean;
}

export interface PriorityContextItem {
  id?: string;
  title?: string;
  price?: string;
  slogan?: string;
  description?: string;
  images?: string[];
  detailImages?: string[];
}

export interface PriorityContextTheme {
  id?: string;
  title?: string;
  story?: string;
  insight?: string;
}

export interface PriorityContext {
  entrySource?: PriorityEntrySource;
  entryDetail?: PriorityEntryDetail;
  targetName?: string;
  eventName?: string;
  eventDate?: string;
  daysLeft?: number;
  remindBeforeDays?: number;
  inReminderWindow?: boolean;
  note?: string;
  relationship?: string;
  interests?: string;
  budget?: string;
  priorityHint?: string;
  responseConstraint?: string;
  slotStatus?: PrioritySlotStatus;
  item?: PriorityContextItem;
  theme?: PriorityContextTheme;
}
