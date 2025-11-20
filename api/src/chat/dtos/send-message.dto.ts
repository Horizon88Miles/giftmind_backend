import { IsOptional, IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PriorityContextDto } from './priority-context.dto';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PriorityContextDto)
  priorityContext?: PriorityContextDto;
}
