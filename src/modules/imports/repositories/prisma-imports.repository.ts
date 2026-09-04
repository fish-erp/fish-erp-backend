import { Injectable } from '@nestjs/common';
import { ImportStatus } from '../../../common/domain/enums.js';
import type { ImportProductWhereInput } from '../../../generated/prisma/models/ImportProduct.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type {
  CreateImportData,
  FindImportsOptions,
  FindImportsResult,
  ImportRecord,
  UpdateImportData,
} from './imports.repository.js';
import { ImportsRepository } from './imports.repository.js';

@Injectable()
export class PrismaImportsRepository extends ImportsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createWithStock(data: CreateImportData): Promise<ImportRecord> {
    const [result] = await this.createManyWithStock([data]);
    if (!result) {
      throw new Error('Failed to create import record');
    }
    return result;
  }

  async createManyWithStock(items: CreateImportData[]): Promise<ImportRecord[]> {
    return this.prisma.$transaction(async (tx) => {
      const results: ImportRecord[] = [];

      for (const data of items) {
        const isCompleted = data.status === ImportStatus.COMPLETED;

        if (isCompleted) {
          await tx.product.update({
            where: { id: data.productId },
            data: {
              remainingQuantity: { increment: data.importQuantity },
              updatedBy: data.createdBy,
            },
          });
        }

        const created = await tx.importProduct.create({
          data: {
            importCode: data.importCode,
            productId: data.productId,
            importPrice: data.importPrice,
            importQuantity: data.importQuantity,
            expireDate: data.expireDate,
            importNote: data.importNote,
            status: data.status,
            completedAt: isCompleted ? (data.completedAt ?? new Date()) : null,
            createdBy: data.createdBy,
            updatedBy: data.updatedBy,
          },
          include: {
            product: true,
          },
        });

        results.push(created as unknown as ImportRecord);
      }

      return results;
    });
  }

  async findMany(options: FindImportsOptions): Promise<FindImportsResult> {
    const where: ImportProductWhereInput = {
      deleteAt: null,
      ...(options.status ? { status: options.status } : {}),
      ...(options.productId ? { productId: options.productId } : {}),
      ...(options.fromDate || options.toDate
        ? {
            createdAt: {
              ...(options.fromDate ? { gte: options.fromDate } : {}),
              ...(options.toDate ? { lte: options.toDate } : {}),
            },
          }
        : {}),
      ...(options.search
        ? {
            OR: [
              { importCode: { contains: options.search, mode: 'insensitive' } },
              { product: { productName: { contains: options.search, mode: 'insensitive' } } },
              { product: { productCode: { contains: options.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.importProduct.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: { createdAt: 'desc' },
        include: {
          product: true,
        },
      }),
      this.prisma.importProduct.count({ where }),
    ]);

    return { items: items as unknown as ImportRecord[], total };
  }

  async findById(id: string): Promise<ImportRecord | null> {
    const record = await this.prisma.importProduct.findFirst({
      where: { id, deleteAt: null },
      include: {
        product: true,
      },
    });

    return record as unknown as ImportRecord | null;
  }

  async findByImportCode(importCode: string): Promise<ImportRecord | null> {
    const record = await this.prisma.importProduct.findFirst({
      where: { importCode, deleteAt: null },
      include: {
        product: true,
      },
    });

    return record as unknown as ImportRecord | null;
  }

  async findItemsByImportCode(importCode: string): Promise<ImportRecord[]> {
    const items = await this.prisma.importProduct.findMany({
      where: { importCode, deleteAt: null },
      include: {
        product: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return items as unknown as ImportRecord[];
  }

  async countByMonth(yearMonthPrefix: string): Promise<number> {
    const distinctCodes = await this.prisma.importProduct.findMany({
      where: {
        importCode: { startsWith: yearMonthPrefix },
      },
      distinct: ['importCode'],
      select: { importCode: true },
    });

    return distinctCodes.length;
  }

  async completeWithStock(id: string, actorId: string): Promise<ImportRecord> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.importProduct.findUniqueOrThrow({
        where: { id },
      });

      const siblingItems = await tx.importProduct.findMany({
        where: { importCode: current.importCode, deleteAt: null },
      });

      for (const item of siblingItems) {
        if (item.status !== ImportStatus.COMPLETED) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              remainingQuantity: { increment: item.importQuantity },
              updatedBy: actorId,
            },
          });

          await tx.importProduct.update({
            where: { id: item.id },
            data: {
              status: ImportStatus.COMPLETED,
              completedAt: new Date(),
              updatedBy: actorId,
            },
          });
        }
      }

      const updated = await tx.importProduct.findUniqueOrThrow({
        where: { id },
        include: {
          product: true,
        },
      });

      return updated as unknown as ImportRecord;
    });
  }

  async cancelWithStock(id: string, actorId: string): Promise<ImportRecord> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.importProduct.findUniqueOrThrow({
        where: { id },
      });

      const siblingItems = await tx.importProduct.findMany({
        where: { importCode: current.importCode, deleteAt: null },
      });

      for (const item of siblingItems) {
        if (item.status === ImportStatus.COMPLETED) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              remainingQuantity: { decrement: item.importQuantity },
              updatedBy: actorId,
            },
          });
        }

        await tx.importProduct.update({
          where: { id: item.id },
          data: {
            status: ImportStatus.CANCELLED,
            cancelledAt: new Date(),
            updatedBy: actorId,
          },
        });
      }

      const updated = await tx.importProduct.findUniqueOrThrow({
        where: { id },
        include: {
          product: true,
        },
      });

      return updated as unknown as ImportRecord;
    });
  }

  async update(id: string, data: UpdateImportData): Promise<ImportRecord> {
    const updated = await this.prisma.importProduct.update({
      where: { id },
      data: {
        ...(data.productId !== undefined ? { productId: data.productId } : {}),
        ...(data.importPrice !== undefined ? { importPrice: data.importPrice } : {}),
        ...(data.importQuantity !== undefined ? { importQuantity: data.importQuantity } : {}),
        ...(data.importCode !== undefined ? { importCode: data.importCode } : {}),
        ...(data.expireDate !== undefined ? { expireDate: data.expireDate } : {}),
        ...(data.importNote !== undefined ? { importNote: data.importNote } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {}),
        ...(data.cancelledAt !== undefined ? { cancelledAt: data.cancelledAt } : {}),
        ...(data.updatedBy !== undefined ? { updatedBy: data.updatedBy } : {}),
      },
      include: {
        product: true,
      },
    });

    return updated as unknown as ImportRecord;
  }

  async softDeleteWithStock(id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.importProduct.findUniqueOrThrow({
        where: { id },
      });

      const siblingItems = await tx.importProduct.findMany({
        where: { importCode: current.importCode, deleteAt: null },
      });

      for (const item of siblingItems) {
        if (item.status === ImportStatus.COMPLETED) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              remainingQuantity: { decrement: item.importQuantity },
              updatedBy: actorId,
            },
          });
        }

        await tx.importProduct.update({
          where: { id: item.id },
          data: {
            deleteAt: new Date(),
            deleteBy: actorId,
            updatedBy: actorId,
          },
        });
      }
    });
  }
}
