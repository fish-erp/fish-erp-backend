import { ConflictException, NotFoundException } from '@nestjs/common';
import { ImportStatus, ProductStatus, ProductType } from '../../../common/domain/enums.js';
import type {
  CreateProductData,
  FindProductsOptions,
  FindProductsResult,
  ProductRecord,
  UpdateProductData,
} from '../../products/repositories/products.repository.js';
import { ProductsRepository } from '../../products/repositories/products.repository.js';
import type {
  CreateImportData,
  FindImportsOptions,
  FindImportsResult,
  ImportRecord,
  UpdateImportData,
} from '../repositories/imports.repository.js';
import { ImportsRepository } from '../repositories/imports.repository.js';
import { ImportsService } from './imports.service.js';

const now = new Date('2026-09-04T00:00:00.000Z');
const actorId = '00000000-0000-4000-8000-000000000001';

class InMemoryProductsRepository extends ProductsRepository {
  private readonly products = new Map<string, ProductRecord>();

  create(data: CreateProductData): Promise<ProductRecord> {
    const record: ProductRecord = {
      id: crypto.randomUUID(),
      productCode: data.productCode,
      productName: data.productName,
      productPrice: data.productPrice as any,
      remainingQuantity: 0,
      productUnit: data.productUnit,
      productNote: data.productNote ?? null,
      type: data.type ?? ProductType.UNKNOWN,
      status: data.status ?? ProductStatus.SELLING,
      createdAt: now,
      updatedAt: now,
      createdBy: data.createdBy ?? null,
      updatedBy: data.updatedBy ?? null,
      deleteAt: null,
      deleteBy: null,
    };
    this.products.set(record.id, record);
    return Promise.resolve(record);
  }

  findMany(options: FindProductsOptions): Promise<FindProductsResult> {
    const items = [...this.products.values()];
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string): Promise<ProductRecord | null> {
    return Promise.resolve(this.products.get(id) ?? null);
  }

  findByProductCode(productCode: string): Promise<ProductRecord | null> {
    return Promise.resolve(
      [...this.products.values()].find((p) => p.productCode === productCode) ?? null,
    );
  }

  update(id: string, data: UpdateProductData): Promise<ProductRecord> {
    const current = this.products.get(id);
    if (!current) throw new Error('Product not found');
    const updated: ProductRecord = {
      ...current,
      ...data,
      ...(data.productPrice !== undefined ? { productPrice: data.productPrice as any } : {}),
      updatedAt: now,
    };
    this.products.set(id, updated);
    return Promise.resolve(updated);
  }

  softDelete(id: string, actorId: string): Promise<void> {
    const current = this.products.get(id);
    if (current) {
      current.deleteAt = now;
      current.deleteBy = actorId;
    }
    return Promise.resolve();
  }
}

class InMemoryImportsRepository extends ImportsRepository {
  public readonly imports = new Map<string, ImportRecord>();

  constructor(private readonly productsRepo: InMemoryProductsRepository) {
    super();
  }

  createWithStock(data: CreateImportData): Promise<ImportRecord> {
    const record: ImportRecord = {
      id: crypto.randomUUID(),
      importCode: data.importCode,
      productId: data.productId,
      importPrice: data.importPrice as any,
      importQuantity: data.importQuantity,
      expireDate: data.expireDate ?? null,
      importNote: data.importNote ?? null,
      status: data.status,
      completedAt: data.completedAt ?? null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: data.createdBy ?? null,
      updatedBy: data.updatedBy ?? null,
      deleteAt: null,
      deleteBy: null,
    };

    if (data.status === ImportStatus.COMPLETED) {
      const product = this.productsRepo['products'].get(data.productId);
      if (product) {
        product.remainingQuantity += data.importQuantity;
      }
    }

    this.imports.set(record.id, record);
    return Promise.resolve(record);
  }

  findMany(options: FindImportsOptions): Promise<FindImportsResult> {
    const items = [...this.imports.values()].filter((item) => item.deleteAt === null);
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string): Promise<ImportRecord | null> {
    const record = this.imports.get(id);
    if (!record || record.deleteAt !== null) return Promise.resolve(null);
    return Promise.resolve(record);
  }

  createManyWithStock(items: CreateImportData[]): Promise<ImportRecord[]> {
    const list = items.map((item) => {
      const record: ImportRecord = {
        id: crypto.randomUUID(),
        importCode: item.importCode,
        productId: item.productId,
        importPrice: item.importPrice as any,
        importQuantity: item.importQuantity,
        expireDate: item.expireDate ?? null,
        importNote: item.importNote ?? null,
        status: item.status,
        completedAt: item.completedAt ?? null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: item.createdBy ?? null,
        updatedBy: item.updatedBy ?? null,
        deleteAt: null,
        deleteBy: null,
      };

      if (item.status === ImportStatus.COMPLETED) {
        const product = this.productsRepo['products'].get(item.productId);
        if (product) {
          product.remainingQuantity += item.importQuantity;
        }
      }

      this.imports.set(record.id, record);
      return record;
    });

    return Promise.resolve(list);
  }

  findItemsByImportCode(importCode: string): Promise<ImportRecord[]> {
    return Promise.resolve(
      [...this.imports.values()].filter(
        (item) => item.importCode === importCode && item.deleteAt === null,
      ),
    );
  }

  findByImportCode(importCode: string): Promise<ImportRecord | null> {
    return Promise.resolve(
      [...this.imports.values()].find((item) => item.importCode === importCode) ?? null,
    );
  }

  countByMonth(yearMonthPrefix: string): Promise<number> {
    return Promise.resolve(
      [...this.imports.values()].filter((item) => item.importCode.startsWith(yearMonthPrefix))
        .length,
    );
  }

  completeWithStock(id: string, actorId: string): Promise<ImportRecord> {
    const record = this.imports.get(id);
    if (!record) throw new Error('Import not found');
    if (record.status !== ImportStatus.COMPLETED) {
      const product = this.productsRepo['products'].get(record.productId);
      if (product) {
        product.remainingQuantity += record.importQuantity;
      }
    }
    record.status = ImportStatus.COMPLETED;
    record.completedAt = now;
    record.updatedBy = actorId;
    return Promise.resolve(record);
  }

  cancelWithStock(id: string, actorId: string): Promise<ImportRecord> {
    const record = this.imports.get(id);
    if (!record) throw new Error('Import not found');
    if (record.status === ImportStatus.COMPLETED) {
      const product = this.productsRepo['products'].get(record.productId);
      if (product) {
        product.remainingQuantity -= record.importQuantity;
      }
    }
    record.status = ImportStatus.CANCELLED;
    record.cancelledAt = now;
    record.updatedBy = actorId;
    return Promise.resolve(record);
  }

  update(id: string, data: UpdateImportData): Promise<ImportRecord> {
    const record = this.imports.get(id);
    if (!record) throw new Error('Import not found');
    const updated: ImportRecord = {
      ...record,
      ...data,
      ...(data.importPrice !== undefined ? { importPrice: data.importPrice as any } : {}),
      updatedAt: now,
    };
    this.imports.set(id, updated);
    return Promise.resolve(updated);
  }

  softDeleteWithStock(id: string, actorId: string): Promise<void> {
    const record = this.imports.get(id);
    if (record) {
      if (record.status === ImportStatus.COMPLETED) {
        const product = this.productsRepo['products'].get(record.productId);
        if (product) {
          product.remainingQuantity -= record.importQuantity;
        }
      }
      record.deleteAt = now;
      record.deleteBy = actorId;
    }
    return Promise.resolve();
  }
}

describe('ImportsService', () => {
  let productsRepo: InMemoryProductsRepository;
  let importsRepo: InMemoryImportsRepository;
  let service: ImportsService;
  let sampleProduct: ProductRecord;

  beforeEach(async () => {
    productsRepo = new InMemoryProductsRepository();
    importsRepo = new InMemoryImportsRepository(productsRepo);
    service = new ImportsService(importsRepo, productsRepo);

    sampleProduct = await productsRepo.create({
      productCode: 'SP-0001',
      productName: 'Thức ăn cá hồi',
      productPrice: 100000,
      productUnit: 'bao',
    });
  });

  it('tạo phiếu nhập COMPLETED và cộng tồn kho sản phẩm', async () => {
    const res = await service.create(
      {
        productId: sampleProduct.id,
        importQuantity: 50,
        importPrice: 80000,
        status: ImportStatus.COMPLETED,
      },
      actorId,
    );

    expect(res.importQuantity).toBe(50);
    expect(res.totalPrice).toBe(4000000);
    expect(res.status).toBe(ImportStatus.COMPLETED);
    expect(res.importCode).toMatch(/^IMP-\d{6}-\d{4}$/);

    const product = await productsRepo.findById(sampleProduct.id);
    expect(product?.remainingQuantity).toBe(50);
  });

  it('tạo phiếu nhập DRAFT không làm thay đổi tồn kho sản phẩm', async () => {
    const res = await service.create(
      {
        productId: sampleProduct.id,
        importQuantity: 30,
        importPrice: 80000,
        status: ImportStatus.DRAFT,
      },
      actorId,
    );

    expect(res.status).toBe(ImportStatus.DRAFT);
    const product = await productsRepo.findById(sampleProduct.id);
    expect(product?.remainingQuantity).toBe(0);
  });

  it('hoàn thành phiếu DRAFT sẽ cộng tồn kho sản phẩm', async () => {
    const draft = await service.create(
      {
        productId: sampleProduct.id,
        importQuantity: 25,
        importPrice: 90000,
        status: ImportStatus.DRAFT,
      },
      actorId,
    );

    expect((await productsRepo.findById(sampleProduct.id))?.remainingQuantity).toBe(0);

    const completed = await service.complete(draft.id, actorId);
    expect(completed.status).toBe(ImportStatus.COMPLETED);

    expect((await productsRepo.findById(sampleProduct.id))?.remainingQuantity).toBe(25);
  });

  it('hủy phiếu COMPLETED sẽ hoàn trừ tồn kho sản phẩm', async () => {
    const completed = await service.create(
      {
        productId: sampleProduct.id,
        importQuantity: 40,
        importPrice: 85000,
        status: ImportStatus.COMPLETED,
      },
      actorId,
    );

    expect((await productsRepo.findById(sampleProduct.id))?.remainingQuantity).toBe(40);

    const cancelled = await service.cancel(completed.id, actorId);
    expect(cancelled.status).toBe(ImportStatus.CANCELLED);

    expect((await productsRepo.findById(sampleProduct.id))?.remainingQuantity).toBe(0);
  });

  it('tạo phiếu nhập chứa nhiều sản phẩm (items) và cộng tồn kho cho từng sản phẩm', async () => {
    const product2 = await productsRepo.create({
      productCode: 'SP-0002',
      productName: 'Men vi sinh',
      productPrice: 200000,
      productUnit: 'gói',
    });

    const res = await service.create(
      {
        importNote: 'Phiếu nhập 2 sản phẩm',
        status: ImportStatus.COMPLETED,
        items: [
          {
            productId: sampleProduct.id,
            importQuantity: 20,
            importPrice: 80000,
          },
          {
            productId: product2.id,
            importQuantity: 10,
            importPrice: 150000,
          },
        ],
      },
      actorId,
    );

    expect(res.items?.length).toBe(2);
    expect(res.importQuantity).toBe(30);
    expect(res.totalPrice).toBe(20 * 80000 + 10 * 150000);

    const p1 = await productsRepo.findById(sampleProduct.id);
    const p2 = await productsRepo.findById(product2.id);
    expect(p1?.remainingQuantity).toBe(20);
    expect(p2?.remainingQuantity).toBe(10);
  });

  it('báo lỗi khi sản phẩm không tồn tại', async () => {
    await expect(
      service.create(
        {
          productId: crypto.randomUUID(),
          importQuantity: 10,
          importPrice: 50000,
        },
        actorId,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('báo lỗi khi mã phiếu nhập bị trùng lặp', async () => {
    await service.create(
      {
        productId: sampleProduct.id,
        importQuantity: 10,
        importPrice: 50000,
        importCode: 'IMP-CUSTOM-01',
      },
      actorId,
    );

    await expect(
      service.create(
        {
          productId: sampleProduct.id,
          importQuantity: 5,
          importPrice: 50000,
          importCode: 'IMP-CUSTOM-01',
        },
        actorId,
      ),
    ).rejects.toThrow(ConflictException);
  });
});
