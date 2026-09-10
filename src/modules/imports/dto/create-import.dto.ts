import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ImportStatus } from '../../../common/domain/enums.js';

export class CreateImportItemDto {
  @ApiProperty({ description: 'ID sản phẩm cần nhập' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 50, description: 'Số lượng nhập (> 0)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  importQuantity!: number;

  @ApiProperty({ example: 120000, description: 'Đơn giá nhập' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  importPrice!: number;

  @ApiPropertyOptional({ example: '2027-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expireDate?: string;

  @ApiPropertyOptional({ description: 'Ghi chú riêng cho dòng sản phẩm' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lineNote?: string;
}

export class CreateImportDto {
  @ApiPropertyOptional({ example: 'IMP-202609-0001', description: 'Tự sinh nếu để trống' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  importCode?: string;

  @ApiPropertyOptional({ description: 'Ghi chú chung của phiếu nhập' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  importNote?: string;

  @ApiPropertyOptional({ enum: ImportStatus, default: ImportStatus.COMPLETED })
  @IsOptional()
  @IsEnum(ImportStatus)
  status?: ImportStatus;

  @ApiProperty({ type: [CreateImportItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateImportItemDto)
  items!: CreateImportItemDto[];
}
