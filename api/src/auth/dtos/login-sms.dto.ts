import { IsString, IsNotEmpty } from 'class-validator';

export class LoginSmsDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}