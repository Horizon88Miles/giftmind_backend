import { IsString, IsEnum, IsOptional, IsArray, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { RelationshipType } from '../archives.types';

const REL_EN_TO_ZH: Record<string, RelationshipType> = {
  family: RelationshipType.FAMILY,
  friend: RelationshipType.FRIEND,
  lover: RelationshipType.LOVER,
  colleague: RelationshipType.COLLEAGUE,
  other: RelationshipType.OTHER,
};

class EventInputDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  date: string;
}

export class UpdateArchiveDto {
  @IsString()
  @IsOptional()
  name?: string;

  @Transform(({ value }) => {
    const v = String(value ?? '').trim();
    return (REL_EN_TO_ZH[v] ?? v) as RelationshipType;
  })
  @IsEnum(RelationshipType)
  @IsOptional()
  relationship?: RelationshipType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventInputDto)
  @IsOptional()
  events?: EventInputDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tag?: string[];
}