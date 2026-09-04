import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportStatus } from '../../../common/domain/enums.js';
import { ProductResponseDto } from '../../products/dto/product-response.dto.js';

export class ImportItemResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  productId!: string;
  @ApiProperty()
  importPrice!: number;
  @ApiProperty()
  importQuantity!: number;
  @ApiProperty()
  totalPrice!: number;
  @ApiPropertyOptional({ nullable: true })
  expireDate!: Date | null;
  @ApiPropertyOptional({ nullable: true })
  lineNote!: string | null;
  @ApiProperty({ type: ProductResponseDto })
  product!: ProductResponseDto;
}

export class ImportResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  importCode!: string;
  @ApiPropertyOptional({ nullable: true })
  importNote!: string | null;
  @ApiProperty({ enum: ImportStatus })
  status!: ImportStatus;
  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;
  @ApiProperty({ type: [ImportItemResponseDto] })
  items!: ImportItemResponseDto[];
  @ApiProperty()
  totalQuantity!: number;
  @ApiProperty()
  totalAmount!: number;
  @ApiProperty()
  createdAt!: Date;
  @ApiProperty()
  updatedAt!: Date;
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
