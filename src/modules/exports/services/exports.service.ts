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
import { initializePayment, lockInvoice } from './invoice-money.js';
import type { CreateExportDto, CreateExportItemDto } from '../dto/create-export.dto.js';
import type {
  ExportItemResponseDto,
  ExportListResponseDto,
  ExportResponseDto,
} from '../dto/export-response.dto.js';
import type { ListExportsQueryDto } from '../dto/list-exports-query.dto.js';
import type { UpdateExportDto } from '../dto/update-export.dto.js';

type ExportInvoiceRecord = Prisma.ExportInvoiceGetPayload<{
  include: { exportProducts: { include: { product: true } }; payments: true };
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
      const exportType = input.exportType ?? ExportType.AT_HOME;
      const shippingFee = exportType === ExportType.DELIVERY
        ? (input.shippingFee !== undefined && input.shippingFee !== null ? input.shippingFee : 5000)
        : 0;
      const invoice = await tx.exportInvoice.create({
        data: {
          ...(await this.customerSnapshot(tx, input.customerId)),
          paidAmount: input.paidAmount ?? 0,
          invoiceCode,
          exportType,
          exportStatus: status,
          shippingFee,
          ...(input.customerId ? {} : { customerName: input.customerName?.trim() || null, customerPhone: input.customerPhone?.trim() || null }),
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
          const origPrice = item.originalPrice !== undefined ? new Prisma.Decimal(item.originalPrice) : product.productPrice;
          let calculatedUnitPrice: Prisma.Decimal;
          if (item.unitPrice !== undefined) {
            calculatedUnitPrice = new Prisma.Decimal(item.unitPrice);
          } else if (item.discount !== undefined && item.discount > 0) {
            calculatedUnitPrice = Prisma.Decimal.max(0, origPrice.minus(item.discount));
          } else {
            calculatedUnitPrice = origPrice;
          }
          return {
            exportInvoiceId: invoice.id,
            productId: item.productId,
            exportQuantity: item.exportQuantity,
            originalPrice: origPrice,
            unitPrice: calculatedUnitPrice,
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
        await initializePayment(tx, invoice.id, actorId);
        await this.stockService.apply(tx, {
          adjustments: input.items.map((item) => {
            const product = productMap.get(item.productId)!;
            const origPrice = item.originalPrice !== undefined ? new Prisma.Decimal(item.originalPrice) : product.productPrice;
            const price = item.unitPrice !== undefined
              ? item.unitPrice
              : item.discount !== undefined && item.discount > 0
              ? Math.max(0, Number(origPrice) - item.discount)
              : Number(origPrice);
            return {
              productId: item.productId,
              quantityDelta: -item.exportQuantity,
              unitPrice: price,
            };
          }),
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
      ...(query.customerId ? { customerId: query.customerId } : {}),
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
        include: { exportProducts: { include: { product: true }, orderBy: { createdAt: 'asc' } }, payments: { orderBy: { paidAt: 'desc' } } },
      }),
      this.prisma.exportInvoice.count({ where }),
    ]);
    const customerIds = items.map((i) => i.customerId).filter((id): id is string => Boolean(id));
    const fifoMap = await this.getFifoMapForCustomerIds(customerIds);
    return {
      data: items.map((item) => this.toResponse(item, fifoMap)),
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
      include: { exportProducts: { include: { product: true }, orderBy: { createdAt: 'asc' } }, payments: { orderBy: { paidAt: 'desc' } } },
    });
    if (!invoice) throw new NotFoundException('Phiếu xuất hàng không tồn tại');
    const customerIds = invoice.customerId ? [invoice.customerId] : [];
    const fifoMap = await this.getFifoMapForCustomerIds(customerIds);
    return this.toResponse(invoice, fifoMap);
  }

  async update(id: string, input: UpdateExportDto, actorId: string): Promise<ExportResponseDto> {
    const current = await this.getInvoice(id);
    if (current.exportStatus !== ExportStatus.EDITING) {
      throw new BadRequestException('Chỉ phiếu xuất nháp mới được chỉnh sửa');
    }
    if (input.items) this.ensureDistinctProducts(input.items);
    await this.prisma.$transaction(async (tx) => {
      await lockInvoice(tx, id);
      const locked = await tx.exportInvoice.findUniqueOrThrow({ where: { id } });
      if (locked.exportStatus !== ExportStatus.EDITING) throw new ConflictException('Phiếu đã được xử lý');
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
          ...(input.customerId !== undefined ? await this.customerSnapshot(tx, input.customerId) : {}),
          ...(input.paidAmount !== undefined ? { plannedPaidAmount: input.paidAmount } : {}),
          ...(input.exportType !== undefined ? { exportType: input.exportType } : {}),
          ...(input.shippingFee !== undefined
            ? { shippingFee: input.shippingFee }
            : input.exportType === ExportType.AT_HOME
            ? { shippingFee: 0 }
            : input.exportType === ExportType.DELIVERY && locked.exportType !== ExportType.DELIVERY
            ? { shippingFee: 5000 }
            : {}),
          ...(!input.customerId && !locked.customerId && input.customerName !== undefined ? { customerName: input.customerName.trim() || null } : {}),
          ...(!input.customerId && !locked.customerId && input.customerPhone !== undefined ? { customerPhone: input.customerPhone.trim() || null } : {}),
          ...(input.deliveryAddress !== undefined ? { deliveryAddress: input.deliveryAddress.trim() || null } : {}),
          ...(input.exportNote !== undefined ? { exportNote: input.exportNote.trim() || null } : {}),
          updatedBy: actorId,
        },
      });
      if (input.items) {
        const updateProducts = await tx.product.findMany({
          where: { id: { in: input.items.map((item) => item.productId) }, deleteAt: null },
        });
        const updateProductMap = new Map(updateProducts.map((p) => [p.id, p]));
        await tx.exportProduct.deleteMany({ where: { exportInvoiceId: id } });
        await tx.exportProduct.createMany({
          data: input.items.map((item) => {
            const product = updateProductMap.get(item.productId)!;
            const origPrice = item.originalPrice !== undefined ? new Prisma.Decimal(item.originalPrice) : product.productPrice;
            let calculatedUnitPrice: Prisma.Decimal;
            if (item.unitPrice !== undefined) {
              calculatedUnitPrice = new Prisma.Decimal(item.unitPrice);
            } else if (item.discount !== undefined && item.discount > 0) {
              calculatedUnitPrice = Prisma.Decimal.max(0, origPrice.minus(item.discount));
            } else {
              calculatedUnitPrice = origPrice;
            }
            return {
              exportInvoiceId: id,
              productId: item.productId,
              exportQuantity: item.exportQuantity,
              originalPrice: origPrice,
              unitPrice: calculatedUnitPrice,
              lineNote: item.lineNote?.trim() || null,
              createdBy: actorId,
              updatedBy: actorId,
            };
          }),
        });
      }
    });
    if (input.exportStatus === ExportStatus.COMPLETED) return this.complete(id, actorId);
    if (input.exportStatus === ExportStatus.CANCELLED) return this.cancel(id, actorId);
    return this.findById(id);
  }

  async complete(id: string, actorId: string): Promise<ExportResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockInvoice(tx, id);
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
        SET original_price = COALESCE(item.original_price, product.product_price),
            unit_price = COALESCE(item.unit_price, product.product_price),
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
          unitPrice: Number(item.unitPrice ?? item.product.productPrice),
        })),
        movementType: InventoryMovementType.EXPORT_COMPLETED,
        documentType: InventoryDocumentType.EXPORT,
        documentId: id,
        documentCode: invoice.invoiceCode,
        occurredAt: now,
        actorId,
      });
      await initializePayment(tx, id, actorId);
    });
    return this.findById(id);
  }

  async cancel(id: string, actorId: string): Promise<ExportResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockInvoice(tx, id);
      if (await tx.customerPayment.count({ where: { invoiceId: id, reversedAt: null } })) throw new BadRequestException('Cần hoàn/đảo các khoản thu trước khi hủy phiếu');
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
    await this.prisma.$transaction(async tx => {
    await lockInvoice(tx, id);
    const invoice = await tx.exportInvoice.findUniqueOrThrow({ where: { id } });
    if (invoice.exportStatus === ExportStatus.COMPLETED) {
      throw new BadRequestException('Phiếu đã hoàn thành phải được hủy trước khi xóa');
    }
    await tx.exportInvoice.update({
      where: { id },
      data: { deleteAt: new Date(), deleteBy: actorId, updatedBy: actorId },
    });
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

  // Tính toán phân bổ thanh toán FIFO cho các đơn hàng của khách hàng
  async getFifoMapForCustomerIds(customerIds: string[]) {
    const validIds = Array.from(new Set(customerIds.filter(Boolean)));
    const map = new Map<string, { allocatedPaid: number; outstanding: number }>();
    if (!validIds.length) return map;

    const rows = await this.prisma.$queryRaw<Array<{ id: string; allocated_paid: Prisma.Decimal; outstanding: Prisma.Decimal }>>(Prisma.sql`
      WITH customer_payments AS (
        SELECT customer_id, COALESCE(SUM(amount), 0) AS total_paid
        FROM fish_erp.customer_payment
        WHERE customer_id IN (${Prisma.join(validIds.map(id => Prisma.sql`${id}::uuid`))})
          AND reversed_at IS NULL
        GROUP BY customer_id
      ),
      invoice_totals AS (
        SELECT ei.id, ei.customer_id, ei.created_at,
          COALESCE(SUM(ep.unit_price * ep.export_quantity), 0) + COALESCE(ei.shipping_fee, 0) AS invoice_total
        FROM fish_erp.export_invoice ei
        JOIN fish_erp.export_product ep ON ep.export_invoice_id = ei.id
        WHERE ei.customer_id IN (${Prisma.join(validIds.map(id => Prisma.sql`${id}::uuid`))})
          AND ei."exportStatus" = 'COMPLETED'
          AND ei.delete_at IS NULL
        GROUP BY ei.id, ei.customer_id, ei.created_at, ei.shipping_fee
      ),
      invoice_fifo AS (
        SELECT it.id, it.customer_id, it.invoice_total,
          COALESCE(SUM(it.invoice_total) OVER (
            PARTITION BY it.customer_id 
            ORDER BY it.created_at ASC, it.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0) AS prev_cum
        FROM invoice_totals it
      )
      SELECT f.id,
        GREATEST(0, LEAST(f.invoice_total, COALESCE(cp.total_paid, 0) - f.prev_cum)) AS allocated_paid,
        GREATEST(0, f.invoice_total - GREATEST(0, LEAST(f.invoice_total, COALESCE(cp.total_paid, 0) - f.prev_cum))) AS outstanding
      FROM invoice_fifo f
      LEFT JOIN customer_payments cp ON cp.customer_id = f.customer_id
    `);

    for (const r of rows) {
      map.set(r.id, { allocatedPaid: Number(r.allocated_paid), outstanding: Number(r.outstanding) });
    }
    return map;
  }

  private toResponse(
    invoice: ExportInvoiceRecord,
    fifoMap?: Map<string, { allocatedPaid: number; outstanding: number }>,
  ): ExportResponseDto {
    const items: ExportItemResponseDto[] = invoice.exportProducts.map((item) => {
      const origPrice = item.originalPrice !== null && item.originalPrice !== undefined
        ? Number(item.originalPrice)
        : Number(item.product.productPrice);
      const uPrice = item.unitPrice !== null && item.unitPrice !== undefined
        ? Number(item.unitPrice)
        : origPrice;
      const discount = Math.max(0, origPrice - uPrice);
      return {
        id: item.id,
        productId: item.productId,
        exportQuantity: item.exportQuantity,
        unitPrice: item.unitPrice ? Number(item.unitPrice) : null,
        originalPrice: item.originalPrice ? Number(item.originalPrice) : origPrice,
        discount,
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
      };
    });
    const shippingFee = invoice.shippingFee ? Number(invoice.shippingFee) : 0;
    const total = invoice.exportProducts.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.unitPrice ?? item.product.productPrice).mul(item.exportQuantity)),
      new Prisma.Decimal(shippingFee),
    );
    const isCompleted = invoice.exportStatus === ExportStatus.COMPLETED;
    const fifo = isCompleted && invoice.id ? fifoMap?.get(invoice.id) : undefined;

    let paidNum: number;
    let outstandingNum: number;
    if (fifo) {
      paidNum = fifo.allocatedPaid;
      outstandingNum = fifo.outstanding;
    } else {
      const paid = (invoice.payments ?? []).filter(p => !p.reversedAt).reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
      paidNum = paid.toNumber();
      outstandingNum = Math.max(0, total.minus(paid).toNumber());
    }

    const paymentStatus = invoice.exportStatus === ExportStatus.CANCELLED
      ? 'CANCELLED'
      : invoice.exportStatus === ExportStatus.EDITING
      ? 'DRAFT'
      : outstandingNum === 0
      ? 'PAID'
      : paidNum > 0
      ? 'PARTIAL'
      : 'UNPAID';

    return {
      customerId: invoice.customerId,
      reconciliationNote: null,
      paymentTracked: true,
      plannedPaidAmount: invoice.paidAmount ? Number(invoice.paidAmount) : null,
      paidAmount: isCompleted ? paidNum : null,
      outstandingAmount: isCompleted ? outstandingNum : null,
      paymentStatus,
      payments: (invoice.payments ?? []).map(p => ({ id: p.id, amount: p.amount.toNumber(), note: p.note, paidAt: p.paidAt, createdBy: p.createdBy, reversedAt: p.reversedAt, reversalReason: p.reversalReason })),
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
      shippingFee,
      totalAmount: total.toNumber(),
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
  }

  private async customerSnapshot(tx: Prisma.TransactionClient, customerId?: string | null) {
    if (!customerId) return { customerId: null, customerName: null, customerPhone: null };
    const customer = await tx.customer.findFirst({ where: { id: customerId, archived: false } });
    if (!customer) throw new BadRequestException('Khách hàng không tồn tại hoặc đã ngừng sử dụng');
    return { customerId: customer.id, customerName: customer.name, customerPhone: customer.phoneNumber };
  }
}
