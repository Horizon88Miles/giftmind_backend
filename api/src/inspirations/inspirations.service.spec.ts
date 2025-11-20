import { Test, TestingModule } from '@nestjs/testing';
import { InspirationsService } from './inspirations.service';

describe('InspirationsService', () => {
  let service: InspirationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InspirationsService],
    }).compile();

    service = module.get<InspirationsService>(InspirationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
