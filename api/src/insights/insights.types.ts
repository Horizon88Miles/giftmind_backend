export type InsightsBoardType = 'reminder' | 'dailyQuote';

export interface ReminderContext {
  eventId: number;
  targetName: string;
  eventName: string;
  eventDate: string;
  eventType?: string;
  daysLeft: number;
  note?: string | null;
  remindBeforeDays?: number;
  inReminderWindow?: boolean;
}

export interface DailyQuoteContext {
  copyId?: number | string;
  source?: string;
  tags?: string[];
  meta?: Record<string, any>;
}

export interface InsightsBoardResponse {
  type: InsightsBoardType;
  message: string;
  context?: ReminderContext | DailyQuoteContext;
  meta?: Record<string, any>;
}

export interface InsightsUpcomingEvent {
  id: number;
  targetName: string;
  eventName: string;
  eventDate: string;
  daysLeft: number;
  remindBeforeDays: number;
  inReminderWindow: boolean;
}
