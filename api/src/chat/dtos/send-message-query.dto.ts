import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class SendMessageQueryDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}