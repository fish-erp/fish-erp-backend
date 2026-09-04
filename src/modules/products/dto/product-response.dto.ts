import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus, ProductType } from '../../../common/domain/enums.js';

export class ProductResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productCode!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  productPrice!: number;

  @ApiProperty()
  remainingQuantity!: number;

  @ApiProperty()
  productUnit!: string;

  @ApiPropertyOptional({ nullable: true })
  productNote!: string | null;

  @ApiProperty({ enum: ProductType })
  type!: ProductType;

  @ApiProperty({ enum: ProductStatus })
  status!: ProductStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ProductListMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class ProductListResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  data!: ProductResponseDto[];

  @ApiProperty({ type: ProductListMetaDto })
  meta!: ProductListMetaDto;
}
