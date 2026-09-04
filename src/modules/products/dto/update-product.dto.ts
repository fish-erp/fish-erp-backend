import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { ProductStatus, ProductType } from '../../../common/domain/enums.js';

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'SP-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  productCode?: string;

  @ApiPropertyOptional({ example: 'Thức ăn cá koi cao cấp' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  productName?: string;

  @ApiPropertyOptional({ example: 150000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productPrice?: number;

  @ApiPropertyOptional({ example: 'kg' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  productUnit?: string;

  @ApiPropertyOptional({ example: 'Hàng nhập khẩu' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  productNote?: string;

  @ApiPropertyOptional({ enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
