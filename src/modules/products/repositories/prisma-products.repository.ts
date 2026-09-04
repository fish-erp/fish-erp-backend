import { Injectable } from '@nestjs/common';
import type { ProductWhereInput } from '../../../generated/prisma/models/Product.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type {
  CreateProductData,
  FindProductsOptions,
  FindProductsResult,
  ProductRecord,
  UpdateProductData,
} from './products.repository.js';
import { ProductsRepository } from './products.repository.js';

@Injectable()
export class PrismaProductsRepository extends ProductsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: CreateProductData): Promise<ProductRecord> {
    return this.prisma.product.create({ data });
  }

  async findMany(options: FindProductsOptions): Promise<FindProductsResult> {
    const where: ProductWhereInput = {
      deleteAt: null,
      ...(options.type ? { type: options.type } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...(options.search
        ? {
            OR: [
              { productCode: { contains: options.search, mode: 'insensitive' } },
              { productName: { contains: options.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string): Promise<ProductRecord | null> {
    return this.prisma.product.findFirst({ where: { id, deleteAt: null } });
  }

  async findByProductCode(productCode: string): Promise<ProductRecord | null> {
    return this.prisma.product.findFirst({ where: { productCode } });
  }

  async update(id: string, data: UpdateProductData): Promise<ProductRecord> {
    return this.prisma.product.update({ where: { id }, data });
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    await this.prisma.product.update({
      where: { id },
      data: {
        deleteAt: new Date(),
        deleteBy: actorId,
        updatedBy: actorId,
      },
    });
  }
}
