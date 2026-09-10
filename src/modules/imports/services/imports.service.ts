import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Product } from '../../../generated/prisma/client.js';
import {
  ImportStatus,
  InventoryDocumentType,
  InventoryMovementType,
} from '../../../common/domain/enums.js';
import { DocumentSequenceService } from '../../../infrastructure/database/prisma/document-sequence.service.js';
import { InventoryStockService } from '../../../infrastructure/database/prisma/inventory-stock.service.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type { CreateImportDto, CreateImportItemDto } from '../dto/create-import.dto.js';
import type {
  ImportItemResponseDto,
  ImportListResponseDto,
  ImportResponseDto,
} from '../dto/import-response.dto.js';
import type { ListImportsQueryDto } from '../dto/list-imports-query.dto.js';
import type { UpdateImportDto } from '../dto/update-import.dto.js';

type ImportReceiptRecord = Prisma.ImportReceiptGetPayload<{
  include: { importProducts: { include: { product: true } } };
}>;

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: DocumentSequenceService,
    private readonly stockService: InventoryStockService,
  ) {}

  async create(input: CreateImportDto, actorId: string): Promise<ImportResponseDto> {
    this.ensureDistinctProducts(input.items);
    const status = input.status ?? ImportStatus.COMPLETED;
    if (status === ImportStatus.CANCELLED) {
      throw new BadRequestException('Không thể tạo mới phiếu nhập ở trạng thái đã hủy');
    }

    const receiptId = await this.prisma.$transaction(async (tx) => {
      const products = await this.findProducts(tx, input.items.map((item) => item.productId));
      const now = new Date();
      const importCode = input.importCode?.trim()
        ? input.importCode.trim()
        : await this.sequenceService.next(tx, 'IMP', now);
      if (await tx.importReceipt.findUnique({ where: { importCode }, select: { id: true } })) {
        throw new ConflictException('Mã phiếu nhập đã tồn tại');
      }

      const receipt = await tx.importReceipt.create({
        data: {
          importCode,
          importNote: input.importNote?.trim() || null,
          status,
          completedAt: status === ImportStatus.COMPLETED ? now : null,
          createdBy: actorId,
          updatedBy: actorId,
        },
        select: { id: true },
      });
      const productMap = new Map(products.map((product) => [product.id, product]));
      await tx.importProduct.createMany({
        data: input.items.map((item) => {
          const product = productMap.get(item.productId)!;
          const completed = status === ImportStatus.COMPLETED;
          return {
            importReceiptId: receipt.id,
            productId: item.productId,
            importPrice: item.importPrice,
            importQuantity: item.importQuantity,
            expireDate: item.expireDate ? new Date(item.expireDate) : null,
            lineNote: item.lineNote?.trim() || null,
            productCodeSnapshot: completed ? product.productCode : null,
            productNameSnapshot: completed ? product.productName : null,
            productUnitSnapshot: completed ? product.productUnit : null,
            createdBy: actorId,
            updatedBy: actorId,
          };
        }),
      });

      if (status === ImportStatus.COMPLETED) {
        await this.stockService.apply(tx, {
          adjustments: input.items.map((item) => ({
            productId: item.productId,
            quantityDelta: item.importQuantity,
            unitPrice: item.importPrice,
          })),
          movementType: InventoryMovementType.IMPORT_COMPLETED,
          documentType: InventoryDocumentType.IMPORT,
          documentId: receipt.id,
          documentCode: importCode,
          occurredAt: now,
          actorId,
        });
      }
      return receipt.id;
    });

    return this.findById(receiptId);
  }

  async findMany(query: ListImportsQueryDto): Promise<ImportListResponseDto> {
    const search = query.search?.trim();
    const where: Prisma.ImportReceiptWhereInput = {
      deleteAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.productId
        ? { importProducts: { some: { productId: query.productId } } }
        : {}),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { importCode: { contains: search, mode: 'insensitive' } },
              {
                importProducts: {
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
      this.prisma.importReceipt.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { importProducts: { include: { product: true }, orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.importReceipt.count({ where }),
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

  async findById(id: string): Promise<ImportResponseDto> {
    const receipt = await this.prisma.importReceipt.findFirst({
      where: { id, deleteAt: null },
      include: { importProducts: { include: { product: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!receipt) throw new NotFoundException('Phiếu nhập kho không tồn tại');
    return this.toResponse(receipt);
  }

  async update(id: string, input: UpdateImportDto, actorId: string): Promise<ImportResponseDto> {
    const current = await this.getReceipt(id);
    if (current.status !== ImportStatus.DRAFT) {
      throw new BadRequestException('Chỉ phiếu nhập nháp mới được chỉnh sửa');
    }
    if (input.items) this.ensureDistinctProducts(input.items);

    await this.prisma.$transaction(async (tx) => {
      if (input.items) await this.findProducts(tx, input.items.map((item) => item.productId));
      if (input.importCode?.trim() && input.importCode.trim() !== current.importCode) {
        const duplicate = await tx.importReceipt.findUnique({
          where: { importCode: input.importCode.trim() },
          select: { id: true },
        });
        if (duplicate) throw new ConflictException('Mã phiếu nhập đã tồn tại');
      }
      await tx.importReceipt.update({
        where: { id },
        data: {
          ...(input.importCode !== undefined ? { importCode: input.importCode.trim() } : {}),
          ...(input.importNote !== undefined ? { importNote: input.importNote.trim() || null } : {}),
          updatedBy: actorId,
        },
      });
      if (input.items) {
        await tx.importProduct.deleteMany({ where: { importReceiptId: id } });
        await tx.importProduct.createMany({
          data: input.items.map((item) => ({
            importReceiptId: id,
            productId: item.productId,
            importPrice: item.importPrice,
            importQuantity: item.importQuantity,
            expireDate: item.expireDate ? new Date(item.expireDate) : null,
            lineNote: item.lineNote?.trim() || null,
            createdBy: actorId,
            updatedBy: actorId,
          })),
        });
      }
    });

    if (input.status === ImportStatus.COMPLETED) return this.complete(id, actorId);
    if (input.status === ImportStatus.CANCELLED) return this.cancel(id, actorId);
    return this.findById(id);
  }

  async complete(id: string, actorId: string): Promise<ImportResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.importReceipt.findFirst({
        where: { id, deleteAt: null },
        include: { importProducts: { include: { product: true } } },
      });
      if (!receipt) throw new NotFoundException('Phiếu nhập kho không tồn tại');
      if (receipt.status === ImportStatus.COMPLETED) return;
      if (receipt.status === ImportStatus.CANCELLED) {
        throw new BadRequestException('Không thể hoàn thành phiếu đã hủy');
      }
      if (receipt.importProducts.some((item) => item.product.deleteAt !== null)) {
        throw new BadRequestException('Phiếu có sản phẩm đã bị xóa');
      }
      const now = new Date();
      const changed = await tx.importReceipt.updateMany({
        where: { id, status: ImportStatus.DRAFT, deleteAt: null },
        data: { status: ImportStatus.COMPLETED, completedAt: now, updatedBy: actorId },
      });
      if (changed.count !== 1) throw new ConflictException('Phiếu nhập đã được xử lý');
      await tx.$executeRaw(Prisma.sql`
        UPDATE fish_erp.import_product AS item
        SET product_code_snapshot = product.product_code,
            product_name_snapshot = product.product_name,
            product_unit_snapshot = product.product_unit,
            updated_by = ${actorId}::uuid,
            updated_at = NOW()
        FROM fish_erp.product AS product
        WHERE item.product_id = product.id AND item.import_receipt_id = ${id}::uuid
      `);
      await this.stockService.apply(tx, {
        adjustments: receipt.importProducts.map((item) => ({
          productId: item.productId,
          quantityDelta: item.importQuantity,
          unitPrice: Number(item.importPrice),
        })),
        movementType: InventoryMovementType.IMPORT_COMPLETED,
        documentType: InventoryDocumentType.IMPORT,
        documentId: id,
        documentCode: receipt.importCode,
        occurredAt: now,
        actorId,
      });
    });
    return this.findById(id);
  }

  async cancel(id: string, actorId: string): Promise<ImportResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.importReceipt.findFirst({
        where: { id, deleteAt: null },
        include: { importProducts: true },
      });
      if (!receipt) throw new NotFoundException('Phiếu nhập kho không tồn tại');
      if (receipt.status === ImportStatus.CANCELLED) return;
      const wasCompleted = receipt.status === ImportStatus.COMPLETED;
      const now = new Date();
      const changed = await tx.importReceipt.updateMany({
        where: { id, status: receipt.status, deleteAt: null },
        data: { status: ImportStatus.CANCELLED, cancelledAt: now, updatedBy: actorId },
      });
      if (changed.count !== 1) throw new ConflictException('Phiếu nhập đã được xử lý');
      if (wasCompleted) {
        await this.stockService.apply(tx, {
          adjustments: receipt.importProducts.map((item) => ({
            productId: item.productId,
            quantityDelta: -item.importQuantity,
            unitPrice: Number(item.importPrice),
          })),
          movementType: InventoryMovementType.IMPORT_CANCELLED,
          documentType: InventoryDocumentType.IMPORT,
          documentId: id,
          documentCode: receipt.importCode,
          occurredAt: now,
          actorId,
        });
      }
    });
    return this.findById(id);
  }

  async delete(id: string, actorId: string): Promise<void> {
    const receipt = await this.getReceipt(id);
    if (receipt.status === ImportStatus.COMPLETED) {
      throw new BadRequestException('Phiếu đã hoàn thành phải được hủy trước khi xóa');
    }
    await this.prisma.importReceipt.update({
      where: { id },
      data: { deleteAt: new Date(), deleteBy: actorId, updatedBy: actorId },
    });
  }

  private async getReceipt(id: string) {
    const receipt = await this.prisma.importReceipt.findFirst({
      where: { id, deleteAt: null },
      select: { id: true, importCode: true, status: true },
    });
    if (!receipt) throw new NotFoundException('Phiếu nhập kho không tồn tại');
    return receipt;
  }

  private ensureDistinctProducts(items: CreateImportItemDto[]): void {
    const ids = items.map((item) => item.productId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Mỗi sản phẩm chỉ được xuất hiện một lần trong phiếu nhập');
    }
  }

  private async findProducts(tx: Prisma.TransactionClient, ids: string[]): Promise<Product[]> {
    const products = await tx.product.findMany({ where: { id: { in: ids }, deleteAt: null } });
    if (products.length !== ids.length) throw new NotFoundException('Có sản phẩm không tồn tại');
    return products;
  }

  private toResponse(receipt: ImportReceiptRecord): ImportResponseDto {
    const items: ImportItemResponseDto[] = receipt.importProducts.map((item) => ({
      id: item.id,
      productId: item.productId,
      importPrice: Number(item.importPrice),
      importQuantity: item.importQuantity,
      totalPrice: Number(item.importPrice) * item.importQuantity,
      expireDate: item.expireDate,
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
      id: receipt.id,
      importCode: receipt.importCode,
      importNote: receipt.importNote,
      status: receipt.status,
      completedAt: receipt.completedAt,
      cancelledAt: receipt.cancelledAt,
      items,
      totalQuantity: items.reduce((sum, item) => sum + item.importQuantity, 0),
      totalAmount: items.reduce((sum, item) => sum + item.totalPrice, 0),
      createdAt: receipt.createdAt,
      updatedAt: receipt.updatedAt,
    };
  }
}
