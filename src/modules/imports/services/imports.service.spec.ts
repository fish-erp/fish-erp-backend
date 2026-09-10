import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type { DocumentSequenceService } from '../../../infrastructure/database/prisma/document-sequence.service.js';
import type { InventoryStockService } from '../../../infrastructure/database/prisma/inventory-stock.service.js';
import { ImportsService } from './imports.service.js';

describe('ImportsService', () => {
  const service = new ImportsService(
    {} as PrismaService,
    {} as DocumentSequenceService,
    {} as InventoryStockService,
  );

  it('rejects a duplicated product before opening a transaction', async () => {
    const productId = '11111111-1111-4111-8111-111111111111';
    await expect(service.create({
      items: [
        { productId, importQuantity: 1, importPrice: 100 },
        { productId, importQuantity: 2, importPrice: 100 },
      ],
    }, '22222222-2222-4222-8222-222222222222')).rejects.toBeInstanceOf(BadRequestException);
  });
});
