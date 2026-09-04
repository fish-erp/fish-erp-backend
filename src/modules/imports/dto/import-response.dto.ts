import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportStatus, ProductStatus, ProductType } from '../../../common/domain/enums.js';

export class ProductSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productCode!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  productUnit!: string;

  @ApiProperty()
  productPrice!: number;

  @ApiProperty()
  remainingQuantity!: number;

  @ApiProperty({ enum: ProductType })
  type!: ProductType;

  @ApiProperty({ enum: ProductStatus })
  status!: ProductStatus;
}

export class ImportResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  importCode!: string;

  @ApiProperty()
  importPrice!: number;

  @ApiProperty()
  importQuantity!: number;

  @ApiProperty({ description: 'Tổng tiền nhập = importPrice * importQuantity' })
  totalPrice!: number;

  @ApiPropertyOptional({ nullable: true })
  expireDate!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  importNote!: string | null;

  @ApiProperty({ enum: ImportStatus })
  status!: ImportStatus;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty()
  productId!: string;

  @ApiPropertyOptional({ type: () => ProductSummaryDto })
  product?: ProductSummaryDto;

  @ApiPropertyOptional({ type: () => [ImportResponseDto], description: 'Danh sách các dòng sản phẩm trong cùng phiếu nhập' })
  items?: ImportResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  createdBy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  updatedBy!: string | null;
}

export class ImportListMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class ImportListResponseDto {
  @ApiProperty({ type: [ImportResponseDto] })
  data!: ImportResponseDto[];

  @ApiProperty({ type: ImportListMetaDto })
  meta!: ImportListMetaDto;
}
