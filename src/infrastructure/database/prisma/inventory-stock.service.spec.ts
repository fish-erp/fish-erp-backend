import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { InventoryDocumentType, InventoryMovementType } from '../../../common/domain/enums.js';
import { InventoryStockService } from './inventory-stock.service.js';

describe('InventoryStockService', () => {
  const queryRawMock = jest.fn();
  const createManyMock = jest.fn();
  const tx = {
    $queryRaw: queryRawMock,
    inventoryMovement: { createMany: createManyMock },
  } as unknown as Prisma.TransactionClient;
  const service = new InventoryStockService();
  const input = {
    adjustments: [
      { productId: '11111111-1111-4111-8111-111111111111', quantityDelta: -2, unitPrice: 100 },
      { productId: '22222222-2222-4222-8222-222222222222', quantityDelta: -3, unitPrice: 200 },
    ],
    movementType: InventoryMovementType.EXPORT_COMPLETED,
    documentType: InventoryDocumentType.EXPORT,
    documentId: '33333333-3333-4333-8333-333333333333',
    documentCode: 'INV-202609-0001',
    occurredAt: new Date('2026-09-04T00:00:00Z'),
    actorId: '44444444-4444-4444-8444-444444444444',
  };

  beforeEach(() => jest.clearAllMocks());

  it('writes all movements after every stock row was updated', async () => {
    queryRawMock.mockResolvedValue([{ id: input.adjustments[0]!.productId }, { id: input.adjustments[1]!.productId }]);
    createManyMock.mockResolvedValue({ count: 2 });
    await service.apply(tx, input);
    // Jest asymmetric matchers are intentionally used for the generated Prisma payload.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    expect(createManyMock).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ quantityDelta: -2 }),
      expect.objectContaining({ quantityDelta: -3 }),
    ]) });
  });

  it('aborts before movements when any product cannot be decremented', async () => {
    queryRawMock.mockResolvedValue([{ id: input.adjustments[0]!.productId }]);
    await expect(service.apply(tx, input)).rejects.toBeInstanceOf(ConflictException);
    expect(createManyMock).not.toHaveBeenCalled();
  });
});
