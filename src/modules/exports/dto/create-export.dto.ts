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
  IsNumber,
  Max,
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

  @ApiPropertyOptional({ description: 'Giá gốc niêm yết' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  originalPrice?: number;

  @ApiPropertyOptional({ description: 'Mức giảm giá trên 1 đơn vị SP' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ description: 'Giá muốn bán thực tế' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lineNote?: string;
}

export class CreateExportDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Đã trả; null hoặc bỏ trống = trả đủ' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999)
  paidAmount?: number | null;

  @ApiPropertyOptional({ example: 'INV-202609-0001', description: 'Tự sinh nếu để trống' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiceCode?: string;

  @ApiPropertyOptional({ enum: ExportType, default: ExportType.AT_HOME })
  @IsOptional()
  @IsEnum(ExportType)
  exportType?: ExportType;

  @ApiPropertyOptional({ description: 'Phí giao hàng (tiền ship)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999)
  shippingFee?: number;

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
