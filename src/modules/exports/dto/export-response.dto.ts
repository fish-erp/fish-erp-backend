import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExportStatus, ExportType } from '../../../common/domain/enums.js';
import { ProductResponseDto } from '../../products/dto/product-response.dto.js';

export class ExportItemResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  productId!: string;
  @ApiProperty()
  exportQuantity!: number;
  @ApiPropertyOptional({ nullable: true })
  unitPrice!: number | null;
  @ApiPropertyOptional({ nullable: true })
  lineNote!: string | null;
  @ApiProperty({ type: ProductResponseDto })
  product!: ProductResponseDto;
}

export class ExportResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  invoiceCode!: string;
  @ApiProperty({ enum: ExportType })
  exportType!: ExportType;
  @ApiProperty({ enum: ExportStatus })
  exportStatus!: ExportStatus;
  @ApiPropertyOptional({ nullable: true })
  customerName!: string | null;
  @ApiPropertyOptional({ nullable: true })
  customerPhone!: string | null;
  @ApiPropertyOptional({ nullable: true })
  deliveryAddress!: string | null;
  @ApiPropertyOptional({ nullable: true })
  exportNote!: string | null;
  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;
  @ApiProperty({ type: [ExportItemResponseDto] })
  items!: ExportItemResponseDto[];
  @ApiProperty()
  totalQuantity!: number;
  @ApiProperty()
  totalAmount!: number;
  @ApiProperty()
  createdAt!: Date;
  @ApiProperty()
  updatedAt!: Date;
}

export class ExportListResponseDto {
  @ApiProperty({ type: [ExportResponseDto] })
  data!: ExportResponseDto[];
  @ApiProperty()
  meta!: { page: number; limit: number; total: number; totalPages: number };
}
