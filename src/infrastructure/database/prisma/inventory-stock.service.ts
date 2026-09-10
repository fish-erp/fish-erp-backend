import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type Prisma as PrismaTypes } from '../../../generated/prisma/client.js';
import type {
  InventoryDocumentType,
  InventoryMovementType,
} from '../../../common/domain/enums.js';

export interface StockAdjustment {
  productId: string;
  quantityDelta: number;
  unitPrice?: number | null;
}

export interface ApplyStockInput {
  adjustments: StockAdjustment[];
  movementType: InventoryMovementType;
  documentType: InventoryDocumentType;
  documentId: string;
  documentCode: string;
  occurredAt: Date;
  actorId: string;
}

@Injectable()
export class InventoryStockService {
  async apply(tx: PrismaTypes.TransactionClient, input: ApplyStockInput): Promise<void> {
    if (input.adjustments.length === 0) return;

    const values = input.adjustments.map((item) =>
      Prisma.sql`(${item.productId}::uuid, ${item.quantityDelta}::integer)`,
    );
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE fish_erp.product AS product
      SET remaining_quantity = product.remaining_quantity + adjustment.quantity_delta,
          updated_by = ${input.actorId}::uuid,
          updated_at = NOW()
      FROM (VALUES ${Prisma.join(values)}) AS adjustment(product_id, quantity_delta)
      WHERE product.id = adjustment.product_id
        AND product.delete_at IS NULL
        AND product.remaining_quantity + adjustment.quantity_delta >= 0
      RETURNING product.id
    `);

    if (rows.length !== input.adjustments.length) {
      throw new ConflictException('Tồn kho không đủ hoặc sản phẩm không còn tồn tại');
    }

    await tx.inventoryMovement.createMany({
      data: input.adjustments.map((item) => ({
        movementType: input.movementType,
        documentType: input.documentType,
        documentId: input.documentId,
        documentCode: input.documentCode,
        productId: item.productId,
        quantityDelta: item.quantityDelta,
        unitPrice: item.unitPrice ?? null,
        occurredAt: input.occurredAt,
        createdBy: input.actorId,
      })),
    });
  }
}
