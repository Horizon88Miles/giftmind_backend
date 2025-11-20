import { IsOptional, IsString, IsBoolean, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  nickname?: string;

  @IsBoolean()
  @IsOptional()
  gender?: boolean;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  @Matches(/^1\d{10}$/, { message: 'phone must be a valid 11-digit number' })
  phone?: string;
}
