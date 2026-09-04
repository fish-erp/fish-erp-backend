import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { ProductStatus, ProductType } from '../../../common/domain/enums.js';

export class CreateProductDto {
  @ApiProperty({ example: 'SP-0001', description: 'Mã sản phẩm nội bộ' })
  @IsString()
  @MaxLength(50)
  productCode!: string;

  @ApiProperty({ example: 'Thức ăn cá koi cao cấp' })
  @IsString()
  @MaxLength(255)
  productName!: string;

  @ApiProperty({ example: 150000, description: 'Giá bán hiện tại' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productPrice!: number;

  @ApiProperty({ example: 'kg', description: 'Đơn vị cơ sở: chai, gói, kg, lít...' })
  @IsString()
  @MaxLength(20)
  productUnit!: string;

  @ApiPropertyOptional({ example: 'Hàng nhập khẩu' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  productNote?: string;

  @ApiPropertyOptional({ enum: ProductType, default: ProductType.UNKNOWN })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.SELLING })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
