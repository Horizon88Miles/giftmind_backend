import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import type { PriorityEntryDetail, PriorityEntrySource } from '../chat.types';

const ENTRY_SOURCES: PriorityEntrySource[] = ['reminder', 'item', 'theme'];
const ENTRY_DETAILS: PriorityEntryDetail[] = [
  'xiaoxiboard',
  'item_detail',
  'theme_detail',
  'giftmind_tab',
  'other',
];

export class PriorityContextSlotStatusDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  targetFilled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  relationshipFilled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  eventFilled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  budgetFilled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  interestsFilled?: boolean;
}

export class PriorityContextItemDto {
  @IsOptional()
  @Type(() => String)
  @IsString()
  id?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  title?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  price?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  slogan?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  detailImages?: string[];
}

export class PriorityContextThemeDto {
  @IsOptional()
  @Type(() => String)
  @IsString()
  id?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  title?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  story?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  insight?: string;
}

export class PriorityContextDto {
  @IsOptional()
  @IsIn(ENTRY_SOURCES)
  entrySource?: PriorityEntrySource;

  @IsOptional()
  @IsIn(ENTRY_DETAILS)
  entryDetail?: PriorityEntryDetail;

  @IsOptional()
  @Type(() => String)
  @IsString()
  targetName?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  eventName?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  eventDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'daysLeft must be a number' })
  daysLeft?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'remindBeforeDays must be a number' })
  remindBeforeDays?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  inReminderWindow?: boolean;

  @IsOptional()
  @Type(() => String)
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  relationship?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  interests?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  budget?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  priorityHint?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  responseConstraint?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PriorityContextItemDto)
  item?: PriorityContextItemDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PriorityContextThemeDto)
  theme?: PriorityContextThemeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PriorityContextSlotStatusDto)
  slotStatus?: PriorityContextSlotStatusDto;
}
