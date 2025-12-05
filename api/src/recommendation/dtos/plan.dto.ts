import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const toStringValue = ({ value }: { value: any }) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
};

export class PlanGiftDto {
  @IsString()
  @IsNotEmpty()
  conversationId!: string;

  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  itemId!: number;

  @IsString()
  @IsNotEmpty()
  itemTitle!: string;

  @Transform(toStringValue)
  @IsString()
  @IsOptional()
  relationship?: string;

  @Transform(toStringValue)
  @IsString()
  @IsOptional()
  itemPrice?: string;

  @Transform(toStringValue)
  @IsString()
  @IsOptional()
  itemSlogan?: string;

  @Transform(toStringValue)
  @IsString()
  @IsOptional()
  itemDescription?: string;

  @Transform(toStringValue)
  @IsString()
  @IsOptional()
  itemCover?: string;
}

export interface GiftPlanResult {
  giftName: string;
  pairing: string;
  scenarios: string[];
  copy: string;
}
