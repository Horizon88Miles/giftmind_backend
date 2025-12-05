import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InsightsBoardResponse, InsightsUpcomingEvent } from './insights.types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REMIND_WINDOW = 7;
const REMINDER_LOOKAHEAD_DAYS = 7;
const DAILY_QUOTE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

type UserEventRecord = {
  id: number;
  userId: number;
  targetName: string;
  eventName: string;
  eventType: string;
  eventDate: Date;
  remindBeforeDays: number;
  note: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

type CopyPayload = {
  id?: number | string;
  text: string;
  source?: string;
  tags?: string[];
  meta?: Record<string, any>;
};

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);
  private readonly staticDailyQuotes: CopyPayload[] = [
    {
      id: 'fallback-1',
      text: '最好的礼物，是那些用心挑选、饱含心意的瞬间。',
      source: 'fallback',
    },
    {
      id: 'fallback-2',
      text: '记住每一个重要的日子，是心意抵达的第一步。',
      source: 'fallback',
    },
    {
      id: 'fallback-3',
      text: '把生活中的温柔时刻，打包成一份专属礼物。',
      source: 'fallback',
    },
  ];
  private dailyQuoteCache?: {
    expiresAt: number;
    payload: InsightsBoardResponse;
  };

  constructor(private readonly prisma: PrismaService) { }

  /**
   * 获取“心犀小报”看板数据
   */
  async getBoardCard(userId: number): Promise<InsightsBoardResponse> {
    const reminderCard = await this.tryGetReminderCard(userId);
    if (reminderCard) {
      return reminderCard;
    }
    return this.getDailyQuoteCard();
  }

  async listUpcomingEvents(userId: number): Promise<InsightsUpcomingEvent[]> {
    if (!userId) {
      return [];
    }
    try {
      const now = new Date();
      const lookAhead = new Date(
        now.getTime() + REMINDER_LOOKAHEAD_DAYS * ONE_DAY_MS,
      );
      const rows = await this.getUpcomingEvents(userId, now, lookAhead, 20);

      return rows.map(event => {
        const daysLeft = this.calcDaysLeft(now, event.eventDate);
        const remindBeforeDays =
          event.remindBeforeDays ?? DEFAULT_REMIND_WINDOW;
        return {
          id: event.id,
          targetName: event.targetName,
          eventName: event.eventName,
          eventDate: event.eventDate.toISOString(),
          daysLeft,
          remindBeforeDays,
          inReminderWindow: daysLeft >= 0 && daysLeft <= remindBeforeDays,
        };
      });
    } catch (error) {
      this.logger.warn(
        `查询用户 ${userId} 即将到来的事件失败`,
        (error as any)?.message,
      );
      return [];
    }
  }

  private async tryGetReminderCard(
    userId: number,
  ): Promise<InsightsBoardResponse | null> {
    if (!userId) {
      return null;
    }

    try {
      const now = new Date();
      const lookAhead = new Date(
        now.getTime() + REMINDER_LOOKAHEAD_DAYS * ONE_DAY_MS,
      );

      const rows = await this.getUpcomingEvents(userId, now, lookAhead, 10);

      const target = this.pickNearestEvent(rows, now);
      if (!target) {
        return null;
      }

      const daysLeft = this.calcDaysLeft(now, target.eventDate);
      const remindBeforeDays = target.remindBeforeDays ?? DEFAULT_REMIND_WINDOW;
      const inReminderWindow = daysLeft >= 0 && daysLeft <= remindBeforeDays;
      return {
        type: 'reminder',
        message: this.composeReminderMessage(target, daysLeft),
        context: {
          eventId: target.id,
          targetName: target.targetName,
          eventName: target.eventName,
          eventDate: target.eventDate.toISOString(),
          eventType: target.eventType,
          daysLeft,
          note: target.note,
          remindBeforeDays,
          inReminderWindow,
        },
        meta: {
          source: target.eventType === 'archive' ? 'archives' : 'user_events',
        },
      };
    } catch (error) {
      this.logger.warn(
        `查询用户 ${userId} 提醒信息失败，将降级为每日文案`,
        (error as any)?.message,
      );
      return null;
    }
  }

  private pickNearestEvent(
    events: UserEventRecord[],
    now: Date,
  ): UserEventRecord | null {
    let candidate: UserEventRecord | null = null;
    let minDays = Number.MAX_SAFE_INTEGER;

    for (const event of events) {
      const daysLeft = this.calcDaysLeft(now, event.eventDate);
      const window = event.remindBeforeDays ?? DEFAULT_REMIND_WINDOW;
      if (daysLeft < 0 || daysLeft > window) {
        continue;
      }
      if (daysLeft < minDays) {
        minDays = daysLeft;
        candidate = event;
      }
    }

    return candidate;
  }

  private calcDaysLeft(from: Date, to: Date): number {
    const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const toDate = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    const diff = toDate.getTime() - fromDate.getTime();
    return Math.floor(diff / ONE_DAY_MS);
  }

  private async getUpcomingEvents(
    userId: number,
    now: Date,
    lookAhead: Date,
    take: number,
  ): Promise<UserEventRecord[]> {
    let directEvents: UserEventRecord[] = [];
    try {
      directEvents = await (this.prisma as any).userEvent.findMany({
        where: {
          userId,
          eventDate: {
            gte: now,
            lte: lookAhead,
          },
        },
        orderBy: { eventDate: 'asc' },
        take,
      });
    } catch (error) {
      // 忽略表不存在等错误，视为无数据，继续查询 Archive
      if (!this.isMissingUserEventsTableError(error)) {
        this.logger.warn(`查询 user_events 失败: ${(error as any).message}`);
      }
    }

    // 始终查询 Archive 中的事件（动态计算），确保心礼档案的新增事件能被识别
    const archiveEvents = await this.fetchUpcomingEventsFromArchives(userId, now, lookAhead, take);

    // 合并并按时间排序
    const all = [...directEvents, ...archiveEvents];
    return all
      .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())
      .slice(0, take);
  }

  private async fetchUpcomingEventsFromArchives(
    userId: number,
    now: Date,
    lookAhead: Date,
    take: number,
  ): Promise<UserEventRecord[]> {
    const rows = await (this.prisma as any).archive.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        events: true,
        event: true,
        date: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const today = this.getStartOfDay(now);
    const end = this.getStartOfDay(lookAhead);
    const events: UserEventRecord[] = [];

    rows.forEach(row => {
      const archiveEvents = this.extractArchiveEvents(row);
      archiveEvents.forEach((archiveEvent, index) => {
        const eventDate = this.parseArchiveEventDate(archiveEvent.date, now);
        if (!eventDate) {
          return;
        }
        const eventDay = this.getStartOfDay(eventDate);
        if (eventDay.getTime() < today.getTime() || eventDay.getTime() > end.getTime()) {
          return;
        }
        events.push({
          id: row.id * 100 + (index + 1),
          userId,
          targetName: row.name,
          eventName: archiveEvent.name ?? '特别日子',
          eventType: 'archive',
          eventDate,
          remindBeforeDays: DEFAULT_REMIND_WINDOW,
          note: null,
          metadata: {
            source: 'archive',
            archiveId: row.id,
            eventIndex: index,
          } as Prisma.JsonObject,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      });
    });

    return events
      .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())
      .slice(0, take);
  }

  private extractArchiveEvents(row: {
    events: Prisma.JsonValue | null;
    event?: string | null;
    date?: Date | null;
  }): { name: string; date: unknown }[] {
    const items: { name: string; date: unknown }[] = [];
    const rawEvents = row.events as Prisma.JsonValue;

    if (Array.isArray(rawEvents)) {
      rawEvents.forEach((entry, index) => {
        if (entry && typeof entry === 'object') {
          const payload = entry as Record<string, any>;
          if (payload.date) {
            items.push({
              name:
                typeof payload.name === 'string'
                  ? payload.name
                  : `事件${index + 1}`,
              date: payload.date,
            });
          }
        }
      });
    }

    if (!items.length && row.event && row.date) {
      items.push({ name: row.event, date: row.date });
    }

    return items;
  }

  private parseArchiveEventDate(input: unknown, now: Date): Date | null {
    if (!input) {
      return null;
    }
    if (input instanceof Date) {
      return this.buildRecurringDate(input.getMonth() + 1, input.getDate(), now);
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) {
        return null;
      }
      const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (ymd) {
        const year = parseInt(ymd[1], 10);
        const month = parseInt(ymd[2], 10);
        const day = parseInt(ymd[3], 10);
        if (year <= 2001) {
          return this.buildRecurringDate(month, day, now);
        }
        const exact = new Date(trimmed);
        if (!isNaN(exact.getTime())) {
          return exact;
        }
      }
      const mmdd = trimmed.match(/^(\d{1,2})-(\d{1,2})$/);
      if (mmdd) {
        return this.buildRecurringDate(
          parseInt(mmdd[1], 10),
          parseInt(mmdd[2], 10),
          now,
        );
      }
      const zh = trimmed.match(/^(\d{1,2})月(\d{1,2})日$/);
      if (zh) {
        return this.buildRecurringDate(
          parseInt(zh[1], 10),
          parseInt(zh[2], 10),
          now,
        );
      }
      const fallback = new Date(trimmed);
      if (!isNaN(fallback.getTime())) {
        return fallback;
      }
    }
    return null;
  }

  private buildRecurringDate(month: number, day: number, now: Date): Date | null {
    if (!month || !day) {
      return null;
    }
    const candidate = new Date(now.getFullYear(), month - 1, day);
    const today = this.getStartOfDay(now);
    if (candidate.getTime() < today.getTime()) {
      candidate.setFullYear(candidate.getFullYear() + 1);
    }
    return candidate;
  }

  private getStartOfDay(input: Date): Date {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }

  private isMissingUserEventsTableError(error: unknown): boolean {
    if (!error) {
      return false;
    }
    const err = error as any;
    if (err?.code === 'P2021') {
      return true;
    }
    const message = err?.message;
    if (typeof message === 'string') {
      return message.includes('table `public.user_events` does not exist');
    }
    return false;
  }

  private composeReminderMessage(
    event: UserEventRecord,
    daysLeft: number,
  ): string {
    const prefix =
      daysLeft <= 0 ? '今天就是' : `还有${daysLeft}天就是`;
    const target = `${event.targetName}的${event.eventName}`;
    return `${prefix}${target}，需要我帮你准备礼物吗？`;
  }

  private async getDailyQuoteCard(): Promise<InsightsBoardResponse> {
    const now = Date.now();
    if (this.dailyQuoteCache && this.dailyQuoteCache.expiresAt > now) {
      return this.dailyQuoteCache.payload;
    }

    const copy: CopyPayload =
      (await this.fetchRandomCopyFromDb()) ?? this.pickFallbackCopy();

    const payload: InsightsBoardResponse = {
      type: 'dailyQuote',
      message: copy.text,
      context: {
        copyId: copy.id,
        source: copy.source,
        tags: copy.tags,
        meta: copy.meta,
      },
      meta: {
        source: copy.source ?? 'fallback',
      },
    };

    this.dailyQuoteCache = {
      payload,
      expiresAt: now + DAILY_QUOTE_CACHE_TTL,
    };

    return payload;
  }

  private async fetchRandomCopyFromDb(): Promise<CopyPayload | null> {
    try {
      const where = { isActive: true };
      const total = await (this.prisma as any).insightCopy.count({ where });
      if (!total) {
        return null;
      }
      const skip = Math.floor(Math.random() * total);
      const [row] = await (this.prisma as any).insightCopy.findMany({
        where,
        take: 1,
        skip,
        orderBy: { id: 'asc' },
      });
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        text: row.text,
        source: row.source,
        tags: row.tags,
        meta: typeof row.metadata === 'object' ? (row.metadata as Record<string, any>) : undefined,
      };
    } catch (error) {
      this.logger.warn(
        '读取数据库文案失败，将使用本地兜底',
        (error as any)?.message,
      );
      return null;
    }
  }

  private pickFallbackCopy(): CopyPayload {
    return this.staticDailyQuotes[
      Math.floor(Math.random() * this.staticDailyQuotes.length)
    ];
  }
}
