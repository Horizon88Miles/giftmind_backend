import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class PlanGiftDto {
  @IsString()
  @IsNotEmpty()
  conversationId!: string;

  @IsNumber()
  @IsNotEmpty()
  itemId!: number;

  @IsString()
  @IsNotEmpty()
  itemTitle!: string;

  @IsString()
  @IsOptional()
  relationship?: string;

  @IsString()
  @IsOptional()
  itemPrice?: string;

  @IsString()
  @IsOptional()
  itemSlogan?: string;

  @IsString()
  @IsOptional()
  itemDescription?: string;
}

export interface GiftPlanResult {
  giftName: string;
  pairing: string;
  scenarios: string[];
  copy: string;
}
