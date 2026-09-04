import ExcelJS from 'exceljs';
import { PassThrough } from 'node:stream';
import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  const queryRawMock = jest.fn();
  const movementFindManyMock = jest.fn();
  const exportFindManyMock = jest.fn();
  const prisma = {
    $queryRaw: queryRawMock,
    inventoryMovement: { findMany: movementFindManyMock },
    exportProduct: { findMany: exportFindManyMock },
  } as unknown as PrismaService;
  const service = new ReportsService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('uses inclusive Vietnam calendar dates', () => {
    const range = service.parseRange({ from: '2026-09-01', to: '2026-09-03', includePrice: false });
    expect(range.from.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2026-09-03T17:00:00.000Z');
  });

  it('omits every price column when includePrice is false', async () => {
    queryRawMock.mockResolvedValue([
      {
        productCode: 'MED-001',
        productName: 'LAVO',
        productUnit: 'chai',
        productType: 'MEDICINE',
        productPrice: new Prisma.Decimal(800000),
        openingQuantity: 2n,
        importedQuantity: 3n,
        cancelledImportQuantity: 0n,
        exportedQuantity: 1n,
        cancelledExportQuantity: 0n,
        closingQuantity: 4n,
      },
    ] as never);
    movementFindManyMock.mockResolvedValue([]);
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    await service.writeInventory(stream, service.parseRange({
      from: '2026-09-01',
      to: '2026-09-03',
      includePrice: false,
    }));

    const workbook = new ExcelJS.Workbook();
    const reader = new PassThrough();
    reader.end(Buffer.concat(chunks));
    await workbook.xlsx.read(reader);
    const headers = workbook.getWorksheet('Nhap xuat ton')!.getRow(1).values;
    expect(headers).not.toContain('Giá bán hiện tại');
    expect(headers).not.toContain('Giá trị tồn cuối');
    expect(workbook.getWorksheet('Chi tiet bien dong')!.getRow(1).values).not.toContain('Đơn giá');
    expect(workbook.getWorksheet('Nhap xuat ton')!.getCell('E2').value).toBe(2);
  });
});
