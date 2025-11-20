import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @IsBoolean()
  @IsOptional()
  importantDateReminder?: boolean;

  @IsBoolean()
  @IsOptional()
  inspirationPush?: boolean;
}
