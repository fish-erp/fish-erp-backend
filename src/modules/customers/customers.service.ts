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
    // Aggregate debt before pagination, using immutable invoice prices and effective payments.
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; phoneNumber: string; address: string | null; archived: boolean; outstandingAmount: Prisma.Decimal; unknownCount: bigint; total: bigint }>>(Prisma.sql`
      WITH summary AS (
        SELECT c.id, c.name, c.phone_number AS "phoneNumber", c.address, c.archived,
          COALESCE(SUM(CASE WHEN i.payment_tracked THEN COALESCE(t.amount,0)-COALESCE(p.amount,0) ELSE 0 END),0) AS "outstandingAmount",
          COUNT(i.id) FILTER (WHERE NOT i.payment_tracked) AS "unknownCount"
        FROM fish_erp.customer c
        LEFT JOIN fish_erp.export_invoice i ON i.customer_id=c.id AND i."exportStatus"='COMPLETED' AND i.delete_at IS NULL
        LEFT JOIN LATERAL (SELECT SUM(unit_price*export_quantity) amount FROM fish_erp.export_product WHERE export_invoice_id=i.id) t ON true
        LEFT JOIN LATERAL (SELECT SUM(amount) amount FROM fish_erp.invoice_payment WHERE invoice_id=i.id AND reversed_at IS NULL) p ON true
        WHERE (${query.archived === 'all'} OR c.archived=${query.archived === 'true'})
          AND (${!search} OR c.name ILIKE ${'%' + (search ?? '') + '%'} OR c.phone_number ILIKE ${'%' + (search ?? '') + '%'})
        GROUP BY c.id
      )
      SELECT *, COUNT(*) OVER() AS total FROM summary
      WHERE (${query.debtOnly !== 'true'} OR "outstandingAmount">0)
      ORDER BY name,id LIMIT ${query.limit} OFFSET ${(query.page-1)*query.limit}
    `);
    const total = Number(rows[0]?.total ?? 0);
    return { data: rows.map(r => ({ id: r.id, name: r.name, phoneNumber: r.phoneNumber, address: r.address, archived: r.archived, outstandingAmount: Number(r.outstandingAmount), unknownCount: Number(r.unknownCount) })), meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1,Math.ceil(total/query.limit)) } };
  }
  async detail(id: string, query: CustomerQuery) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Khách hàng không tồn tại');
    const where = { customerId: id, deleteAt: null };
    const [ids, total] = await Promise.all([
      this.prisma.exportInvoice.findMany({ where, select: { id: true }, orderBy: { createdAt: 'desc' }, take: query.limit, skip: (query.page-1)*query.limit }),
      this.prisma.exportInvoice.count({ where }),
    ]);
    const invoices = await Promise.all(ids.map(i => this.exports.findById(i.id)));
    return { ...customer, invoices, meta: { page: query.page, total, totalPages: Math.max(1,Math.ceil(total/query.limit)) } };
  }
}
