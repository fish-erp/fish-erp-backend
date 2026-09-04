import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExportStatus, ExportType } from '../../../common/domain/enums.js';

export class CreateExportItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  exportQuantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lineNote?: string;
}

export class CreateExportDto {
  @ApiPropertyOptional({ example: 'INV-202609-0001', description: 'Tự sinh nếu để trống' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiceCode?: string;

  @ApiPropertyOptional({ enum: ExportType, default: ExportType.AT_HOME })
  @IsOptional()
  @IsEnum(ExportType)
  exportType?: ExportType;

  @ApiPropertyOptional({ enum: ExportStatus, default: ExportStatus.COMPLETED })
  @IsOptional()
  @IsEnum(ExportStatus)
  exportStatus?: ExportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  exportNote?: string;

  @ApiProperty({ type: [CreateExportItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateExportItemDto)
  items!: CreateExportItemDto[];
}
