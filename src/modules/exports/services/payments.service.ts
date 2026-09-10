import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import { ExportsService } from './exports.service.js';
import { invoiceTotal, lockInvoice } from './invoice-money.js';
import type { PaymentInput, ReconcileInput, ReversalInput } from '../dto/payment.dto.js';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly exports: ExportsService) {}
  async add(id: string, input: PaymentInput, actor: string) {
    if (input.idempotencyKey.startsWith('initial:') || input.idempotencyKey.startsWith('reconcile:')) throw new BadRequestException('Mã giao dịch không hợp lệ');
    await this.prisma.$transaction(async tx => {
      await lockInvoice(tx, id);
      const invoice = await tx.exportInvoice.findUniqueOrThrow({ where: { id }, include: { exportProducts: true, payments: true } });
      const old = invoice.payments.find(p => p.idempotencyKey === input.idempotencyKey);
      if (old) {
        if (!old.amount.eq(input.amount) || old.note !== (input.note?.trim() || null) || (input.paidAt && old.paidAt.getTime() !== new Date(input.paidAt).getTime())) throw new ConflictException('Mã giao dịch đã dùng cho khoản thu khác');
        return;
      }
      if (invoice.exportStatus !== 'COMPLETED') throw new BadRequestException('Chỉ thu tiền phiếu hoàn tất');
      if (!invoice.customerId) throw new BadRequestException('Phiếu chưa có khách hàng để thu tiền');
      const total = invoiceTotal(invoice.exportProducts);
      const paid = invoice.payments.filter(p => !p.reversedAt).reduce((sum,p) => sum.plus(p.amount), new Prisma.Decimal(0));
      const amount = new Prisma.Decimal(input.amount);
      if (amount.lte(0) || amount.gt(total.minus(paid))) throw new BadRequestException('Số tiền thu vượt số còn nợ hoặc không hợp lệ');
      if (input.paidAt && new Date(input.paidAt).getTime() > Date.now()) throw new BadRequestException('Ngày thu không được ở tương lai');
      await tx.customerPayment.create({ data: { customerId: invoice.customerId, invoiceId: id, amount, idempotencyKey: input.idempotencyKey, note: input.note?.trim() || null, ...(input.paidAt ? { paidAt: new Date(input.paidAt) } : {}), createdBy: actor } });
    });
    return this.exports.findById(id);
  }
  async reverse(id: string, paymentId: string, input: ReversalInput, actor: string) {
    if (!input.reason.trim()) throw new BadRequestException('Cần lý do hoàn/đảo khoản thu');
    await this.prisma.$transaction(async tx => {
      await lockInvoice(tx, id);
      const payment = await tx.customerPayment.findFirst({ where: { id: paymentId, invoiceId: id } });
      if (!payment) throw new BadRequestException('Khoản thu không tồn tại');
      if (payment.reversedAt) return;
      await tx.customerPayment.update({ where: { id: paymentId }, data: { reversedAt: new Date(), reversedBy: actor, reversalReason: input.reason.trim() } });
    });
    return this.exports.findById(id);
  }
  async reconcile(id: string, input: ReconcileInput, actor: string) {
    if (!input.note.trim()) throw new BadRequestException('Cần ghi chú đối soát');
    await this.prisma.$transaction(async tx => {
      await lockInvoice(tx, id);
      const invoice = await tx.exportInvoice.findUniqueOrThrow({ where: { id }, include: { exportProducts: true } });
      if (invoice.exportStatus !== 'COMPLETED') throw new BadRequestException('Chỉ đối soát phiếu hoàn tất');
      const total = invoiceTotal(invoice.exportProducts);
      if (new Prisma.Decimal(input.paidAmount).lt(0) || new Prisma.Decimal(input.paidAmount).gt(total)) throw new BadRequestException('Số đã thu không hợp lệ hoặc vượt tổng tiền');
      const customerId = input.customerId ?? invoice.customerId;
      if (new Prisma.Decimal(input.paidAmount).lt(total) && !customerId) throw new BadRequestException('Cần chọn khách để xác nhận nợ cũ');
      if (customerId && !await tx.customer.findFirst({ where: { id: customerId, archived: false } })) throw new BadRequestException('Khách hàng không hợp lệ');
      await tx.exportInvoice.update({ where: { id }, data: { customerId, updatedBy: actor } });
      if (input.paidAmount > 0) await tx.customerPayment.create({ data: { customerId: customerId!, invoiceId: id, amount: input.paidAmount, note: 'Đối soát đơn cũ: ' + input.note.trim().slice(0,470), idempotencyKey: 'reconcile:' + id, createdBy: actor } });
    });
    return this.exports.findById(id);
  }
}
