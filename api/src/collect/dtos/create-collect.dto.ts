import { IsNotEmpty, IsNumber } from 'class-validator';

/**
 * 创建收藏 DTO（仅好物）
 */
export class CreateCollectDto {
  @IsNumber({}, { message: '好物ID必须是数字' })
  @IsNotEmpty({ message: '好物ID不能为空' })
  itemId: number;
}