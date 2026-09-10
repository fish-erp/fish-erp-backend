import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service.js';
import { normalizeVietnamPhoneNumber } from '../../common/utils/phone-number.js';
import { ExportsService } from '../exports/services/exports.service.js';
import type { CustomerInput, CustomerQuery, CustomerUpdate } from './customers.dto.js';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService, private readonly exports: ExportsService) {}
  private fields(input: CustomerInput) {
    const phoneNumber = normalizeVietnamPhoneNumber(input.phoneNumber);
    if (!phoneNumber) throw new BadRequestException('Số điện thoại Việt Nam không hợp lệ');
    if (!input.name.trim()) throw new BadRequestException('Vui lòng nhập tên khách hàng');
    return { name: input.name.trim(), phoneNumber, address: input.address?.trim() || null };
  }
  async create(input: CustomerInput, actor: string) {
    try { return await this.prisma.customer.create({ data: { ...this.fields(input), createdBy: actor, updatedBy: actor } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('SĐT đã có khách hàng. Hãy chọn hồ sơ có sẵn (kể cả đã ngừng sử dụng).');
      throw error;
    }
  }
  async update(id: string, input: CustomerUpdate, actor: string) {
    const current = await this.prisma.customer.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Khách hàng không tồn tại');
    const fields = this.fields({ name: input.name ?? current.name, phoneNumber: input.phoneNumber ?? current.phoneNumber, address: input.address ?? current.address ?? '' });
    try { return await this.prisma.customer.update({ where: { id }, data: { ...fields, ...(input.archived !== undefined ? { archived: input.archived } : {}), updatedBy: actor } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('SĐT đã được sử dụng');
      throw error;
    }
  }
  async list(query: CustomerQuery) {
    const search = query.search?.trim();
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; phoneNumber: string; address: string | null; archived: boolean; totalPurchased: Prisma.Decimal; totalPaid: Prisma.Decimal; outstandingAmount: Prisma.Decimal; advanceAmount: Prisma.Decimal; total: bigint }>>(Prisma.sql`
      WITH summary AS (
        SELECT c.id, c.name, c.phone_number AS "phoneNumber", c.address, c.archived,
          COALESCE(purchases.amount, 0) AS "totalPurchased",
          COALESCE(payments.amount, 0) AS "totalPaid",
          GREATEST(0, COALESCE(purchases.amount, 0) - COALESCE(payments.amount, 0)) AS "outstandingAmount",
          GREATEST(0, COALESCE(payments.amount, 0) - COALESCE(purchases.amount, 0)) AS "advanceAmount"
        FROM fish_erp.customer c
        LEFT JOIN LATERAL (
          SELECT SUM(ep.unit_price * ep.export_quantity) AS amount
          FROM fish_erp.export_invoice ei
          JOIN fish_erp.export_product ep ON ep.export_invoice_id = ei.id
          WHERE ei.customer_id = c.id AND ei."exportStatus" = 'COMPLETED' AND ei.delete_at IS NULL
        ) purchases ON true
        LEFT JOIN LATERAL (
          SELECT SUM(cp.amount) AS amount
          FROM fish_erp.customer_payment cp
          WHERE cp.customer_id = c.id AND cp.reversed_at IS NULL
        ) payments ON true
        WHERE (${query.archived === 'all'} OR c.archived = ${query.archived === 'true'})
          AND (${!search} OR c.name ILIKE ${'%' + (search ?? '') + '%'} OR c.phone_number ILIKE ${'%' + (search ?? '') + '%'})
        GROUP BY c.id, purchases.amount, payments.amount
      )
      SELECT *, COUNT(*) OVER() AS total FROM summary
      WHERE (${query.debtOnly !== 'true'} OR "outstandingAmount" > 0)
      ORDER BY name, id LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
    `);
    const total = Number(rows[0]?.total ?? 0);
    return {
      data: rows.map(r => ({
        id: r.id,
        name: r.name,
        phoneNumber: r.phoneNumber,
        address: r.address,
        archived: r.archived,
        totalPurchased: Number(r.totalPurchased),
        totalPaid: Number(r.totalPaid),
        outstandingAmount: Number(r.outstandingAmount),
        advanceAmount: Number(r.advanceAmount),
      })),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  async detail(id: string, query: CustomerQuery) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Khách hàng không tồn tại');

    const [purchasesAgg, paymentsAgg] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: Prisma.Decimal }>>(Prisma.sql`
        SELECT COALESCE(SUM(ep.unit_price * ep.export_quantity), 0) AS total
        FROM fish_erp.export_invoice ei
        JOIN fish_erp.export_product ep ON ep.export_invoice_id = ei.id
        WHERE ei.customer_id = ${id}::uuid AND ei."exportStatus" = 'COMPLETED' AND ei.delete_at IS NULL
      `),
      this.prisma.customerPayment.aggregate({
        where: { customerId: id, reversedAt: null },
        _sum: { amount: true },
      }),
    ]);

    const totalPurchased = Number(purchasesAgg[0]?.total ?? 0);
    const totalPaid = Number(paymentsAgg._sum.amount ?? 0);
    const outstandingAmount = Math.max(0, totalPurchased - totalPaid);
    const advanceAmount = Math.max(0, totalPaid - totalPurchased);

    const [exportList, payments] = await Promise.all([
      this.exports.findMany({ customerId: id, page: query.page, limit: query.limit }),
      this.prisma.customerPayment.findMany({
        where: { customerId: id },
        orderBy: { paidAt: 'desc' },
      }),
    ]);

    return {
      ...customer,
      totalPurchased,
      totalPaid,
      outstandingAmount,
      advanceAmount,
      invoices: exportList.data,
      payments: payments.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        note: p.note,
        paidAt: p.paidAt,
        invoiceId: p.invoiceId,
        createdBy: p.createdBy,
        reversedAt: p.reversedAt,
        reversedBy: p.reversedBy,
        reversalReason: p.reversalReason,
      })),
      meta: { page: query.page, total: exportList.meta.total, totalPages: exportList.meta.totalPages },
    };
  }

  async addPayment(customerId: string, input: import('./customers.dto.js').CustomerPaymentInput, actorId: string) {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) throw new BadRequestException('Số tiền thu phải lớn hơn 0');
    if (input.paidAt && new Date(input.paidAt).getTime() > Date.now()) throw new BadRequestException('Ngày thu không được ở tương lai');

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Khách hàng không tồn tại');
    if (customer.archived) throw new BadRequestException('Khách hàng đã ngừng sử dụng');

    await this.prisma.$transaction(async tx => {
      const existing = await tx.customerPayment.findFirst({
        where: { customerId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (!existing.amount.eq(amount)) throw new ConflictException('Mã giao dịch đã dùng cho khoản thu khác');
        return;
      }
      await tx.customerPayment.create({
        data: {
          customerId,
          amount,
          idempotencyKey: input.idempotencyKey,
          note: input.note?.trim() || null,
          ...(input.paidAt ? { paidAt: new Date(input.paidAt) } : {}),
          invoiceId: input.invoiceId || null,
          createdBy: actorId,
        },
      });
    });

    return this.detail(customerId, { page: 1, limit: 10 });
  }

  async reversePayment(customerId: string, paymentId: string, input: import('./customers.dto.js').CustomerReversalInput, actorId: string) {
    if (!input.reason.trim()) throw new BadRequestException('Cần lý do hoàn/đảo khoản thu');

    await this.prisma.$transaction(async tx => {
      const payment = await tx.customerPayment.findFirst({
        where: { id: paymentId, customerId },
      });
      if (!payment) throw new NotFoundException('Khoản thu không tồn tại');
      if (payment.reversedAt) return;

      await tx.customerPayment.update({
        where: { id: paymentId },
        data: {
          reversedAt: new Date(),
          reversedBy: actorId,
          reversalReason: input.reason.trim(),
        },
      });
    });

    return this.detail(customerId, { page: 1, limit: 10 });
  }
}
