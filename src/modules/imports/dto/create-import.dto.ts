import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'ID sản phẩm cần nhập' })
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

  @ApiPropertyOptional({ example: '2027-12-31T00:00:00.000Z', description: 'Hạn sử dụng' })
  @IsOptional()
  @IsDateString()
  expireDate?: string;

  @ApiPropertyOptional({ example: 'Hàng mới nhập', description: 'Ghi chú cho sản phẩm này' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  importNote?: string;
}

export class CreateImportDto {
  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'ID sản phẩm (nếu nhập 1 sản phẩm)' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ example: 50, description: 'Số lượng nhập' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  importQuantity?: number;

  @ApiPropertyOptional({ example: 120000, description: 'Đơn giá nhập' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  importPrice?: number;

  @ApiPropertyOptional({ example: 'IMP-202609-0001', description: 'Mã phiếu nhập (tự sinh nếu để trống)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  importCode?: string;

  @ApiPropertyOptional({ example: '2027-12-31T00:00:00.000Z', description: 'Hạn sử dụng' })
  @IsOptional()
  @IsDateString()
  expireDate?: string;

  @ApiPropertyOptional({ example: 'Nhập lô hàng tháng 9', description: 'Ghi chú phiếu nhập' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  importNote?: string;

  @ApiPropertyOptional({ enum: ImportStatus, default: ImportStatus.COMPLETED, description: 'Trạng thái phiếu nhập' })
  @IsOptional()
  @IsEnum(ImportStatus)
  status?: ImportStatus;

  @ApiPropertyOptional({ type: [CreateImportItemDto], description: 'Danh sách nhiều sản phẩm trong 1 phiếu nhập' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateImportItemDto)
  items?: CreateImportItemDto[];
}
