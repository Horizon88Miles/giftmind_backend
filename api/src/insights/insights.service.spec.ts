import { Test, TestingModule } from '@nestjs/testing';
import { InsightsService } from './insights.service';
import { PrismaService } from '../prisma/prisma.service';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('InsightsService', () => {
  let service: InsightsService;
  const mockPrisma = {
    userEvent: {
      findMany: jest.fn(),
    },
    insightCopy: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    mockPrisma.userEvent.findMany.mockReset();
    mockPrisma.insightCopy.count.mockReset();
    mockPrisma.insightCopy.findMany.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<InsightsService>(InsightsService);
  });

  it('returns reminder card when there is an upcoming event', async () => {
    const now = new Date();
    mockPrisma.userEvent.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        targetName: '妈妈',
        eventName: '生日',
        eventType: 'birthday',
        eventDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        remindBeforeDays: 7,
        note: null,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mockPrisma.insightCopy.count.mockResolvedValue(0);
    mockPrisma.insightCopy.findMany.mockResolvedValue([]);

    const result = await service.getBoardCard(1);

    expect(result.type).toBe('reminder');
    expect(result.context).toMatchObject({ daysLeft: 3, targetName: '妈妈' });
    expect(mockPrisma.insightCopy.count).not.toHaveBeenCalled();
  });

  it('returns db daily quote when no events found', async () => {
    mockPrisma.userEvent.findMany.mockResolvedValue([]);
    mockPrisma.insightCopy.count.mockResolvedValue(1);
    mockPrisma.insightCopy.findMany.mockResolvedValue([
      {
        id: 10,
        text: '把温柔留给值得的人。',
        source: 'seed',
        tags: ['daily', 'quote'],
        metadata: null,
      },
    ]);

    const result = await service.getBoardCard(2);

    expect(result.type).toBe('dailyQuote');
    expect(result.message).toBe('把温柔留给值得的人。');
    expect(mockPrisma.insightCopy.count).toHaveBeenCalled();
  });

  it('uses local fallback when db empty', async () => {
    mockPrisma.userEvent.findMany.mockResolvedValue([]);
    mockPrisma.insightCopy.count.mockResolvedValue(0);
    mockPrisma.insightCopy.findMany.mockResolvedValue([]);

    const result = await service.getBoardCard(3);

    expect(result.type).toBe('dailyQuote');
    expect(result.message.length).toBeGreaterThan(0);
  });
  it('lists upcoming events with daysLeft info', async () => {
    const now = new Date();
    mockPrisma.userEvent.findMany.mockResolvedValue([
      {
        id: 2,
        userId: 1,
        targetName: '朋友',
        eventName: '纪念日',
        eventType: 'anniversary',
        eventDate: new Date(now.getTime() + 2 * ONE_DAY_MS),
        remindBeforeDays: 3,
        note: null,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const upcoming = await service.listUpcomingEvents(1);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]).toMatchObject({
      id: 2,
      targetName: '朋友',
      inReminderWindow: true,
    });
  });

  it('returns empty array when userId missing', async () => {
    const upcoming = await service.listUpcomingEvents(undefined as any);
    expect(upcoming).toEqual([]);
  });

  it('returns empty array when prisma throws', async () => {
    mockPrisma.userEvent.findMany.mockRejectedValueOnce(
      new Error('db offline'),
    );
    const upcoming = await service.listUpcomingEvents(9);
    expect(upcoming).toEqual([]);
  });
});
