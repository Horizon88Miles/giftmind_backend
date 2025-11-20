import { Test, TestingModule } from '@nestjs/testing';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

describe('InsightsController', () => {
  let controller: InsightsController;
  let service: InsightsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InsightsController],
      providers: [
        {
          provide: InsightsService,
          useValue: {
            getBoardCard: jest.fn(),
            listUpcomingEvents: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<InsightsController>(InsightsController);
    service = module.get<InsightsService>(InsightsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates upcoming events request to service', async () => {
    (service.listUpcomingEvents as jest.Mock).mockResolvedValue([
      {
        id: 1,
        targetName: 'test',
        eventName: '生日',
        eventDate: new Date().toISOString(),
        daysLeft: 2,
        remindBeforeDays: 7,
        inReminderWindow: true,
      },
    ]);
    const result = await controller.getUpcomingEvents({ user: { id: 9 } });
    expect(service.listUpcomingEvents).toHaveBeenCalledWith(9);
    expect(result).toEqual([
      {
        id: 1,
        targetName: 'test',
        eventName: '生日',
        eventDate: expect.any(String),
        daysLeft: 2,
        remindBeforeDays: 7,
        inReminderWindow: true,
      },
    ]);
  });
});
