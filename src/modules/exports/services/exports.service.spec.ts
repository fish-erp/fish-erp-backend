import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type { DocumentSequenceService } from '../../../infrastructure/database/prisma/document-sequence.service.js';
import type { InventoryStockService } from '../../../infrastructure/database/prisma/inventory-stock.service.js';
import { ExportsService } from './exports.service.js';

describe('ExportsService', () => {
  const service = new ExportsService(
    {} as PrismaService,
    {} as DocumentSequenceService,
    {} as InventoryStockService,
  );

  it('rejects a duplicated product before opening a transaction', async () => {
    const productId = '11111111-1111-4111-8111-111111111111';
    await expect(service.create({
      items: [
        { productId, exportQuantity: 1 },
        { productId, exportQuantity: 2 },
      ],
    }, '22222222-2222-4222-8222-222222222222')).rejects.toBeInstanceOf(BadRequestException);
  });
});
