import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ImportStatus } from '../../../common/domain/enums.js';

export class UpdateImportDto {
  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  importQuantity?: number;

  @ApiPropertyOptional({ example: 125000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  importPrice?: number;

  @ApiPropertyOptional({ example: 'IMP-202609-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  importCode?: string;

  @ApiPropertyOptional({ example: '2027-12-31T00:00:00.000Z', nullable: true })
  @IsOptional()
  @IsDateString()
  expireDate?: string | null;

  @ApiPropertyOptional({ example: 'Ghi chú cập nhật', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  importNote?: string | null;

  @ApiPropertyOptional({ enum: ImportStatus })
  @IsOptional()
  @IsEnum(ImportStatus)
  status?: ImportStatus;
}
