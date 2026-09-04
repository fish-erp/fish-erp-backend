import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  ExportStatus,
  ExportType,
  InventoryDocumentType,
  InventoryMovementType,
  ProductStatus,
} from '../../../common/domain/enums.js';
import { DocumentSequenceService } from '../../../infrastructure/database/prisma/document-sequence.service.js';
import { InventoryStockService } from '../../../infrastructure/database/prisma/inventory-stock.service.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type { CreateExportDto, CreateExportItemDto } from '../dto/create-export.dto.js';
import type {
  ExportItemResponseDto,
  ExportListResponseDto,
  ExportResponseDto,
} from '../dto/export-response.dto.js';
import type { ListExportsQueryDto } from '../dto/list-exports-query.dto.js';
import type { UpdateExportDto } from '../dto/update-export.dto.js';

type ExportInvoiceRecord = Prisma.ExportInvoiceGetPayload<{
  include: { exportProducts: { include: { product: true } } };
}>;

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: DocumentSequenceService,
    private readonly stockService: InventoryStockService,
  ) {}

  async create(input: CreateExportDto, actorId: string): Promise<ExportResponseDto> {
    this.ensureDistinctProducts(input.items);
    const status = input.exportStatus ?? ExportStatus.COMPLETED;
    if (status === ExportStatus.CANCELLED) {
      throw new BadRequestException('Không thể tạo mới phiếu xuất ở trạng thái đã hủy');
    }

    const invoiceId = await this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: input.items.map((item) => item.productId) }, deleteAt: null },
      });
      if (products.length !== input.items.length) {
        throw new NotFoundException('Có sản phẩm không tồn tại');
      }
      if (status === ExportStatus.COMPLETED && products.some((p) => p.status !== ProductStatus.SELLING)) {
        throw new BadRequestException('Chỉ sản phẩm đang bán mới được xuất kho');
      }
      const now = new Date();
      const invoiceCode = input.invoiceCode?.trim()
        ? input.invoiceCode.trim()
        : await this.sequenceService.next(tx, 'INV', now);
      if (await tx.exportInvoice.findUnique({ where: { invoiceCode }, select: { id: true } })) {
        throw new ConflictException('Mã phiếu xuất đã tồn tại');
      }
      const invoice = await tx.exportInvoice.create({
        data: {
          invoiceCode,
          exportType: input.exportType ?? ExportType.AT_HOME,
          exportStatus: status,
          customerName: input.customerName?.trim() || null,
          customerPhone: input.customerPhone?.trim() || null,
          deliveryAddress: input.deliveryAddress?.trim() || null,
          exportNote: input.exportNote?.trim() || null,
          completedAt: status === ExportStatus.COMPLETED ? now : null,
          createdBy: actorId,
          updatedBy: actorId,
        },
        select: { id: true },
      });
      const productMap = new Map(products.map((product) => [product.id, product]));
      await tx.exportProduct.createMany({
        data: input.items.map((item) => {
          const product = productMap.get(item.productId)!;
          const completed = status === ExportStatus.COMPLETED;
          return {
            exportInvoiceId: invoice.id,
            productId: item.productId,
            exportQuantity: item.exportQuantity,
            unitPrice: completed ? product.productPrice : null,
            lineNote: item.lineNote?.trim() || null,
            productCodeSnapshot: completed ? product.productCode : null,
            productNameSnapshot: completed ? product.productName : null,
            productUnitSnapshot: completed ? product.productUnit : null,
            createdBy: actorId,
            updatedBy: actorId,
          };
        }),
      });
      if (status === ExportStatus.COMPLETED) {
        await this.stockService.apply(tx, {
          adjustments: input.items.map((item) => ({
            productId: item.productId,
            quantityDelta: -item.exportQuantity,
            unitPrice: Number(productMap.get(item.productId)!.productPrice),
          })),
          movementType: InventoryMovementType.EXPORT_COMPLETED,
          documentType: InventoryDocumentType.EXPORT,
          documentId: invoice.id,
          documentCode: invoiceCode,
          occurredAt: now,
          actorId,
        });
      }
      return invoice.id;
    });
    return this.findById(invoiceId);
  }

  async findMany(query: ListExportsQueryDto): Promise<ExportListResponseDto> {
    const search = query.search?.trim();
    const where: Prisma.ExportInvoiceWhereInput = {
      deleteAt: null,
      ...(query.exportStatus ? { exportStatus: query.exportStatus } : {}),
      ...(query.exportType ? { exportType: query.exportType } : {}),
      ...(search
        ? {
            OR: [
              { invoiceCode: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
              { customerPhone: { contains: search, mode: 'insensitive' } },
              {
                exportProducts: {
                  some: {
                    OR: [
                      { product: { productName: { contains: search, mode: 'insensitive' } } },
                      { product: { productCode: { contains: search, mode: 'insensitive' } } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.exportInvoice.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { exportProducts: { include: { product: true }, orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.exportInvoice.count({ where }),
    ]);
    return {
      data: items.map((item) => this.toResponse(item)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  async findById(id: string): Promise<ExportResponseDto> {
    const invoice = await this.prisma.exportInvoice.findFirst({
      where: { id, deleteAt: null },
      include: { exportProducts: { include: { product: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!invoice) throw new NotFoundException('Phiếu xuất hàng không tồn tại');
    return this.toResponse(invoice);
  }

  async update(id: string, input: UpdateExportDto, actorId: string): Promise<ExportResponseDto> {
    const current = await this.getInvoice(id);
    if (current.exportStatus !== ExportStatus.EDITING) {
      throw new BadRequestException('Chỉ phiếu xuất nháp mới được chỉnh sửa');
    }
    if (input.items) this.ensureDistinctProducts(input.items);
    await this.prisma.$transaction(async (tx) => {
      if (input.items) {
        const count = await tx.product.count({
          where: { id: { in: input.items.map((item) => item.productId) }, deleteAt: null },
        });
        if (count !== input.items.length) throw new NotFoundException('Có sản phẩm không tồn tại');
      }
      if (input.invoiceCode?.trim() && input.invoiceCode.trim() !== current.invoiceCode) {
        const duplicate = await tx.exportInvoice.findUnique({
          where: { invoiceCode: input.invoiceCode.trim() },
          select: { id: true },
        });
        if (duplicate) throw new ConflictException('Mã phiếu xuất đã tồn tại');
      }
      await tx.exportInvoice.update({
        where: { id },
        data: {
          ...(input.invoiceCode !== undefined ? { invoiceCode: input.invoiceCode.trim() } : {}),
          ...(input.exportType !== undefined ? { exportType: input.exportType } : {}),
          ...(input.customerName !== undefined ? { customerName: input.customerName.trim() || null } : {}),
          ...(input.customerPhone !== undefined ? { customerPhone: input.customerPhone.trim() || null } : {}),
          ...(input.deliveryAddress !== undefined ? { deliveryAddress: input.deliveryAddress.trim() || null } : {}),
          ...(input.exportNote !== undefined ? { exportNote: input.exportNote.trim() || null } : {}),
          updatedBy: actorId,
        },
      });
      if (input.items) {
        await tx.exportProduct.deleteMany({ where: { exportInvoiceId: id } });
        await tx.exportProduct.createMany({
          data: input.items.map((item) => ({
            exportInvoiceId: id,
            productId: item.productId,
            exportQuantity: item.exportQuantity,
            lineNote: item.lineNote?.trim() || null,
            createdBy: actorId,
            updatedBy: actorId,
          })),
        });
      }
    });
    if (input.exportStatus === ExportStatus.COMPLETED) return this.complete(id, actorId);
    if (input.exportStatus === ExportStatus.CANCELLED) return this.cancel(id, actorId);
    return this.findById(id);
  }

  async complete(id: string, actorId: string): Promise<ExportResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.exportInvoice.findFirst({
        where: { id, deleteAt: null },
        include: { exportProducts: { include: { product: true } } },
      });
      if (!invoice) throw new NotFoundException('Phiếu xuất hàng không tồn tại');
      if (invoice.exportStatus === ExportStatus.COMPLETED) return;
      if (invoice.exportStatus === ExportStatus.CANCELLED) {
        throw new BadRequestException('Không thể hoàn thành phiếu đã hủy');
      }
      if (invoice.exportProducts.some((item) => item.product.deleteAt || item.product.status !== ProductStatus.SELLING)) {
        throw new BadRequestException('Phiếu có sản phẩm không còn được bán');
      }
      const now = new Date();
      const changed = await tx.exportInvoice.updateMany({
        where: { id, exportStatus: ExportStatus.EDITING, deleteAt: null },
        data: { exportStatus: ExportStatus.COMPLETED, completedAt: now, updatedBy: actorId },
      });
      if (changed.count !== 1) throw new ConflictException('Phiếu xuất đã được xử lý');
      await tx.$executeRaw(Prisma.sql`
        UPDATE fish_erp.export_product AS item
        SET unit_price = product.product_price,
            product_code_snapshot = product.product_code,
            product_name_snapshot = product.product_name,
            product_unit_snapshot = product.product_unit,
            updated_by = ${actorId}::uuid,
            updated_at = NOW()
        FROM fish_erp.product AS product
        WHERE item.product_id = product.id AND item.export_invoice_id = ${id}::uuid
      `);
      await this.stockService.apply(tx, {
        adjustments: invoice.exportProducts.map((item) => ({
          productId: item.productId,
          quantityDelta: -item.exportQuantity,
          unitPrice: Number(item.product.productPrice),
        })),
        movementType: InventoryMovementType.EXPORT_COMPLETED,
        documentType: InventoryDocumentType.EXPORT,
        documentId: id,
        documentCode: invoice.invoiceCode,
        occurredAt: now,
        actorId,
      });
    });
    return this.findById(id);
  }

  async cancel(id: string, actorId: string): Promise<ExportResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.exportInvoice.findFirst({
        where: { id, deleteAt: null },
        include: { exportProducts: true },
      });
      if (!invoice) throw new NotFoundException('Phiếu xuất hàng không tồn tại');
      if (invoice.exportStatus === ExportStatus.CANCELLED) return;
      const wasCompleted = invoice.exportStatus === ExportStatus.COMPLETED;
      const now = new Date();
      const changed = await tx.exportInvoice.updateMany({
        where: { id, exportStatus: invoice.exportStatus, deleteAt: null },
        data: { exportStatus: ExportStatus.CANCELLED, cancelledAt: now, updatedBy: actorId },
      });
      if (changed.count !== 1) throw new ConflictException('Phiếu xuất đã được xử lý');
      if (wasCompleted) {
        await this.stockService.apply(tx, {
          adjustments: invoice.exportProducts.map((item) => ({
            productId: item.productId,
            quantityDelta: item.exportQuantity,
            unitPrice: item.unitPrice ? Number(item.unitPrice) : null,
          })),
          movementType: InventoryMovementType.EXPORT_CANCELLED,
          documentType: InventoryDocumentType.EXPORT,
          documentId: id,
          documentCode: invoice.invoiceCode,
          occurredAt: now,
          actorId,
        });
      }
    });
    return this.findById(id);
  }

  async delete(id: string, actorId: string): Promise<void> {
    const invoice = await this.getInvoice(id);
    if (invoice.exportStatus === ExportStatus.COMPLETED) {
      throw new BadRequestException('Phiếu đã hoàn thành phải được hủy trước khi xóa');
    }
    await this.prisma.exportInvoice.update({
      where: { id },
      data: { deleteAt: new Date(), deleteBy: actorId, updatedBy: actorId },
    });
  }

  private async getInvoice(id: string) {
    const invoice = await this.prisma.exportInvoice.findFirst({
      where: { id, deleteAt: null },
      select: { id: true, invoiceCode: true, exportStatus: true },
    });
    if (!invoice) throw new NotFoundException('Phiếu xuất hàng không tồn tại');
    return invoice;
  }

  private ensureDistinctProducts(items: CreateExportItemDto[]): void {
    const ids = items.map((item) => item.productId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Mỗi sản phẩm chỉ được xuất hiện một lần trong phiếu xuất');
    }
  }

  private toResponse(invoice: ExportInvoiceRecord): ExportResponseDto {
    const items: ExportItemResponseDto[] = invoice.exportProducts.map((item) => ({
      id: item.id,
      productId: item.productId,
      exportQuantity: item.exportQuantity,
      unitPrice: item.unitPrice ? Number(item.unitPrice) : null,
      lineNote: item.lineNote,
      product: {
        id: item.product.id,
        productCode: item.productCodeSnapshot ?? item.product.productCode,
        productName: item.productNameSnapshot ?? item.product.productName,
        productPrice: Number(item.product.productPrice),
        remainingQuantity: item.product.remainingQuantity,
        productUnit: item.productUnitSnapshot ?? item.product.productUnit,
        productNote: item.product.productNote,
        type: item.product.type,
        status: item.product.status,
        createdAt: item.product.createdAt,
        updatedAt: item.product.updatedAt,
      },
    }));
    return {
      id: invoice.id,
      invoiceCode: invoice.invoiceCode,
      exportType: invoice.exportType,
      exportStatus: invoice.exportStatus,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
      deliveryAddress: invoice.deliveryAddress,
      exportNote: invoice.exportNote,
      completedAt: invoice.completedAt,
      cancelledAt: invoice.cancelledAt,
      items,
      totalQuantity: items.reduce((sum, item) => sum + item.exportQuantity, 0),
      totalAmount: items.reduce(
        (sum, item) => sum + (item.unitPrice ?? item.product.productPrice) * item.exportQuantity,
        0,
      ),
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
  }
}
