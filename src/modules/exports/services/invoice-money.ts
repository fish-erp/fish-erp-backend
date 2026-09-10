import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';

export async function lockInvoice(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM fish_erp.export_invoice WHERE id = ${id}::uuid AND delete_at IS NULL FOR UPDATE`);
  if (!rows.length) throw new NotFoundException('Phiếu xuất không tồn tại');
}

export function invoiceTotal(
  items: Array<{ unitPrice: Prisma.Decimal | null; exportQuantity: number }>,
  shippingFee?: Prisma.Decimal | number | null,
): Prisma.Decimal {
  const itemsSum = items.reduce((sum, item) => {
    if (item.unitPrice === null) throw new BadRequestException('Phiếu chưa chốt đơn giá');
    return sum.plus(item.unitPrice.mul(item.exportQuantity));
  }, new Prisma.Decimal(0));
  return itemsSum.plus(new Prisma.Decimal(shippingFee ?? 0));
}

export async function initializePayment(tx: Prisma.TransactionClient, id: string, actorId: string): Promise<void> {
  const invoice = await tx.exportInvoice.findUniqueOrThrow({ where: { id }, include: { exportProducts: true } });
  const total = invoiceTotal(invoice.exportProducts, invoice.shippingFee);
  const amount = invoice.paidAmount ?? new Prisma.Decimal(0);
  if (amount.lt(0) || amount.gt(total)) throw new BadRequestException('Đã trả phải từ 0 đến tổng tiền');
  if (amount.lt(total) && !invoice.customerId) throw new BadRequestException('Vui lòng chọn khách hàng để ghi nợ');
  if (amount.gt(0) && invoice.customerId) {
    await tx.customerPayment.create({
      data: {
        customerId: invoice.customerId,
        invoiceId: id,
        amount,
        idempotencyKey: `initial:${id}`,
        note: `Thu khi hoàn tất phiếu ${invoice.invoiceCode}`,
        createdBy: actorId,
      },
    });
  }
}

