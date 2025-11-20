import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class LatestMessagesQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number;
}