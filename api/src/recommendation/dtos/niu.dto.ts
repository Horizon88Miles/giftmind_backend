// 统一将导入语句放在顶部
import { IntersectionType } from "@nestjs/mapped-types";
import { IsString, IsNotEmpty } from "class-validator";

// 类名采用 PascalCase 规范
export class RequestNiuDto {
  category?: string[];
  occasion?: string[];
  recipient?: string[];
  interest?: string[];
  style?: string[];
  attribute?: string[];
  price_range?: {
    max?: number;
    min?: number;
  };
  keyword?: string[];
  excluded_items?: string[];
}

export class NLUResultDto {
  intent: 'recommendation' | 'chitchat' | 'clarify' | 'unknown';
  slots: RequestNiuDto;
}

export class AnalyzeNiuDto {
  @IsString()
  @IsNotEmpty()
  userInput: string;

  @IsString()
  @IsNotEmpty()
  conversationId: string;
}