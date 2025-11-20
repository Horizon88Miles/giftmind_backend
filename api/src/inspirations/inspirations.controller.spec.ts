import { Test, TestingModule } from '@nestjs/testing';
import { InspirationsController } from './inspirations.controller';

describe('InspirationsController', () => {
  let controller: InspirationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InspirationsController],
    }).compile();

    controller = module.get<InspirationsController>(InspirationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
