import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Writable } from 'node:stream';
import { Prisma } from '../../../generated/prisma/client.js';
import { ExportStatus, InventoryMovementType } from '../../../common/domain/enums.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type { ExportReportQueryDto } from '../dto/export-report-query.dto.js';

export interface ReportRange {
  from: Date;
  toExclusive: Date;
  fromLabel: string;
  toLabel: string;
  includePrice: boolean;
}

interface InventorySummaryRow {
  productCode: string;
  productName: string;
  productUnit: string;
  productType: string;
  productPrice: Prisma.Decimal;
  openingQuantity: bigint;
  importedQuantity: bigint;
  cancelledImportQuantity: bigint;
  exportedQuantity: bigint;
  cancelledExportQuantity: bigint;
  closingQuantity: bigint;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  parseRange(query: ExportReportQueryDto): ReportRange {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(query.from) || !datePattern.test(query.to)) {
      throw new BadRequestException('Ngày báo cáo phải có định dạng YYYY-MM-DD');
    }
    const from = new Date(`${query.from}T00:00:00+07:00`);
    const toStart = new Date(`${query.to}T00:00:00+07:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(toStart.getTime()) || from > toStart) {
      throw new BadRequestException('Khoảng ngày báo cáo không hợp lệ');
    }
    const toExclusive = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
    return {
      from,
      toExclusive,
      fromLabel: query.from,
      toLabel: query.to,
      includePrice: query.includePrice,
    };
  }

  async writeInventory(output: Writable, range: ReportRange): Promise<void> {
    const workbook = this.createWorkbook(output);
    const summary = workbook.addWorksheet('Nhap xuat ton', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const summaryColumns: Partial<ExcelJS.Column>[] = [
      { header: 'Mã sản phẩm', key: 'productCode', width: 18 },
      { header: 'Tên sản phẩm', key: 'productName', width: 32 },
      { header: 'Loại', key: 'productType', width: 16 },
      { header: 'Đơn vị', key: 'productUnit', width: 12 },
      { header: 'Tồn đầu kỳ', key: 'openingQuantity', width: 14, style: { numFmt: '#,##0' } },
      { header: 'Nhập kho', key: 'importedQuantity', width: 14, style: { numFmt: '#,##0' } },
      { header: 'Hủy nhập', key: 'cancelledImportQuantity', width: 14, style: { numFmt: '#,##0' } },
      { header: 'Xuất kho', key: 'exportedQuantity', width: 14, style: { numFmt: '#,##0' } },
      { header: 'Hủy xuất', key: 'cancelledExportQuantity', width: 14, style: { numFmt: '#,##0' } },
      { header: 'Tồn cuối kỳ', key: 'closingQuantity', width: 14, style: { numFmt: '#,##0' } },
    ];
    if (range.includePrice) {
      summaryColumns.push(
        { header: 'Giá bán hiện tại', key: 'productPrice', width: 18, style: { numFmt: '#,##0' } },
        { header: 'Giá trị tồn cuối', key: 'closingValue', width: 20, style: { numFmt: '#,##0' } },
      );
    }
    summary.columns = summaryColumns;
    this.styleHeader(summary.getRow(1));
    summary.autoFilter = { from: 'A1', to: `${this.columnLetter(summaryColumns.length)}1` };

    const rows = await this.inventorySummary(range);
    for (const row of rows) {
      const closingQuantity = Number(row.closingQuantity);
      summary.addRow({
        productCode: row.productCode,
        productName: row.productName,
        productType: this.productTypeLabel(row.productType),
        productUnit: row.productUnit,
        openingQuantity: Number(row.openingQuantity),
        importedQuantity: Number(row.importedQuantity),
        cancelledImportQuantity: Number(row.cancelledImportQuantity),
        exportedQuantity: Number(row.exportedQuantity),
        cancelledExportQuantity: Number(row.cancelledExportQuantity),
        closingQuantity,
        ...(range.includePrice
          ? {
              productPrice: Number(row.productPrice),
              closingValue: closingQuantity * Number(row.productPrice),
            }
          : {}),
      }).commit();
    }
    summary.commit();

    const detail = workbook.addWorksheet('Chi tiet bien dong', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const detailColumns: Partial<ExcelJS.Column>[] = [
      { header: 'Thời gian', key: 'occurredAt', width: 21, style: { numFmt: 'dd/mm/yyyy hh:mm' } },
      { header: 'Loại biến động', key: 'movementType', width: 22 },
      { header: 'Mã phiếu', key: 'documentCode', width: 22 },
      { header: 'Mã sản phẩm', key: 'productCode', width: 18 },
      { header: 'Tên sản phẩm', key: 'productName', width: 32 },
      { header: 'Đơn vị', key: 'productUnit', width: 12 },
      { header: 'Thay đổi', key: 'quantityDelta', width: 14, style: { numFmt: '#,##0' } },
    ];
    if (range.includePrice) {
      detailColumns.push(
        { header: 'Đơn giá', key: 'unitPrice', width: 18, style: { numFmt: '#,##0' } },
        { header: 'Thành tiền', key: 'amount', width: 20, style: { numFmt: '#,##0' } },
      );
    }
    detail.columns = detailColumns;
    this.styleHeader(detail.getRow(1));
    detail.autoFilter = { from: 'A1', to: `${this.columnLetter(detailColumns.length)}1` };
    let cursor: string | undefined;
    do {
      const movements = await this.prisma.inventoryMovement.findMany({
        where: { occurredAt: { gte: range.from, lt: range.toExclusive } },
        take: 1000,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        include: { product: true },
      });
      for (const movement of movements) {
        const unitPrice = movement.unitPrice ? Number(movement.unitPrice) : null;
        detail.addRow({
          occurredAt: movement.occurredAt,
          movementType: this.movementLabel(movement.movementType),
          documentCode: movement.documentCode,
          productCode: movement.product.productCode,
          productName: movement.product.productName,
          productUnit: movement.product.productUnit,
          quantityDelta: movement.quantityDelta,
          ...(range.includePrice
            ? {
                unitPrice,
                amount: unitPrice === null ? null : Math.abs(movement.quantityDelta) * unitPrice,
              }
            : {}),
        }).commit();
      }
      cursor = movements.length === 1000 ? movements.at(-1)?.id : undefined;
    } while (cursor);
    detail.commit();
    await workbook.commit();
  }

  async writeSales(output: Writable, range: ReportRange): Promise<void> {
    const workbook = this.createWorkbook(output);
    const sheet = workbook.addWorksheet('Ban hang', { views: [{ state: 'frozen', ySplit: 1 }] });
    const columns: Partial<ExcelJS.Column>[] = [
      { header: 'Ngày bán', key: 'completedAt', width: 21, style: { numFmt: 'dd/mm/yyyy hh:mm' } },
      { header: 'Mã hóa đơn', key: 'invoiceCode', width: 22 },
      { header: 'Kiểu xuất', key: 'exportType', width: 16 },
      { header: 'Khách hàng', key: 'customerName', width: 24 },
      { header: 'Số điện thoại', key: 'customerPhone', width: 18 },
      { header: 'Mã sản phẩm', key: 'productCode', width: 18 },
      { header: 'Tên sản phẩm', key: 'productName', width: 32 },
      { header: 'Đơn vị', key: 'productUnit', width: 12 },
      { header: 'Số lượng', key: 'quantity', width: 14, style: { numFmt: '#,##0' } },
    ];
    if (range.includePrice) {
      columns.push(
        { header: 'Đơn giá', key: 'unitPrice', width: 18, style: { numFmt: '#,##0' } },
        { header: 'Thành tiền', key: 'amount', width: 20, style: { numFmt: '#,##0' } },
      );
    }
    sheet.columns = columns;
    this.styleHeader(sheet.getRow(1));
    sheet.autoFilter = { from: 'A1', to: `${this.columnLetter(columns.length)}1` };
    let cursor: string | undefined;
    do {
      const lines = await this.prisma.exportProduct.findMany({
        where: {
          exportInvoice: {
            exportStatus: ExportStatus.COMPLETED,
            deleteAt: null,
            completedAt: { gte: range.from, lt: range.toExclusive },
          },
        },
        take: 1000,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        include: { product: true, exportInvoice: true },
      });
      for (const line of lines) {
        const unitPrice = line.unitPrice ? Number(line.unitPrice) : 0;
        sheet.addRow({
          completedAt: line.exportInvoice.completedAt,
          invoiceCode: line.exportInvoice.invoiceCode,
          exportType: line.exportInvoice.exportType === 'DELIVERY' ? 'Giao hàng' : 'Tại nhà',
          customerName: line.exportInvoice.customerName ?? '',
          customerPhone: line.exportInvoice.customerPhone ?? '',
          productCode: line.productCodeSnapshot ?? line.product.productCode,
          productName: line.productNameSnapshot ?? line.product.productName,
          productUnit: line.productUnitSnapshot ?? line.product.productUnit,
          quantity: line.exportQuantity,
          ...(range.includePrice ? { unitPrice, amount: unitPrice * line.exportQuantity } : {}),
        }).commit();
      }
      cursor = lines.length === 1000 ? lines.at(-1)?.id : undefined;
    } while (cursor);
    sheet.commit();
    await workbook.commit();
  }

  private createWorkbook(output: Writable): ExcelJS.stream.xlsx.WorkbookWriter {
    return new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: output,
      useStyles: true,
      useSharedStrings: false,
    });
  }

  private async inventorySummary(range: ReportRange): Promise<InventorySummaryRow[]> {
    return this.prisma.$queryRaw<InventorySummaryRow[]>(Prisma.sql`
      SELECT
        product.product_code AS "productCode",
        product.product_name AS "productName",
        product.product_unit AS "productUnit",
        product.type::text AS "productType",
        product.product_price AS "productPrice",
        COALESCE(SUM(movement.quantity_delta) FILTER (WHERE movement.occurred_at < ${range.from}), 0)::bigint AS "openingQuantity",
        COALESCE(SUM(movement.quantity_delta) FILTER (WHERE movement.movement_type = 'IMPORT_COMPLETED' AND movement.occurred_at >= ${range.from} AND movement.occurred_at < ${range.toExclusive}), 0)::bigint AS "importedQuantity",
        COALESCE(-SUM(movement.quantity_delta) FILTER (WHERE movement.movement_type = 'IMPORT_CANCELLED' AND movement.occurred_at >= ${range.from} AND movement.occurred_at < ${range.toExclusive}), 0)::bigint AS "cancelledImportQuantity",
        COALESCE(-SUM(movement.quantity_delta) FILTER (WHERE movement.movement_type = 'EXPORT_COMPLETED' AND movement.occurred_at >= ${range.from} AND movement.occurred_at < ${range.toExclusive}), 0)::bigint AS "exportedQuantity",
        COALESCE(SUM(movement.quantity_delta) FILTER (WHERE movement.movement_type = 'EXPORT_CANCELLED' AND movement.occurred_at >= ${range.from} AND movement.occurred_at < ${range.toExclusive}), 0)::bigint AS "cancelledExportQuantity",
        COALESCE(SUM(movement.quantity_delta) FILTER (WHERE movement.occurred_at < ${range.toExclusive}), 0)::bigint AS "closingQuantity"
      FROM fish_erp.product AS product
      LEFT JOIN fish_erp.inventory_movement AS movement ON movement.product_id = product.id
      WHERE product.delete_at IS NULL
      GROUP BY product.id
      ORDER BY product.product_name ASC
    `);
  }

  private styleHeader(row: ExcelJS.Row): void {
    row.height = 24;
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075985' } };
    row.alignment = { vertical: 'middle', horizontal: 'center' };
    row.commit();
  }

  private columnLetter(count: number): string {
    let value = count;
    let result = '';
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result;
  }

  private productTypeLabel(type: string): string {
    return { MEDICINE: 'Thuốc', FEED: 'Thức ăn', OTHER: 'Khác', UNKNOWN: 'Chưa xác định' }[type] ?? type;
  }

  private movementLabel(type: string): string {
    return {
      [InventoryMovementType.OPENING_BALANCE]: 'Tồn đầu kỳ',
      [InventoryMovementType.IMPORT_COMPLETED]: 'Hoàn thành nhập',
      [InventoryMovementType.IMPORT_CANCELLED]: 'Hủy nhập',
      [InventoryMovementType.EXPORT_COMPLETED]: 'Hoàn thành xuất',
      [InventoryMovementType.EXPORT_CANCELLED]: 'Hủy xuất',
    }[type] ?? type;
  }
}
