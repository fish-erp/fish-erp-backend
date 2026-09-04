import type * as runtime from '@prisma/client/runtime/client';
import type { ProductStatus, ProductType } from '../../../common/domain/enums.js';

export interface ProductRecord {
  id: string;
  productCode: string;
  productName: string;
  productPrice: runtime.Decimal;
  remainingQuantity: number;
  productUnit: string;
  productNote: string | null;
  type: ProductType;
  status: ProductStatus;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
  deleteAt: Date | null;
  deleteBy: string | null;
}

export interface CreateProductData {
  productCode: string;
  productName: string;
  productPrice: number;
  productUnit: string;
  productNote?: string;
  type?: ProductType;
  status?: ProductStatus;
  createdBy?: string;
  updatedBy?: string;
}

export interface UpdateProductData {
  productCode?: string;
  productName?: string;
  productPrice?: number;
  productUnit?: string;
  productNote?: string;
  type?: ProductType;
  status?: ProductStatus;
  updatedBy?: string;
}

export interface FindProductsOptions {
  skip: number;
  take: number;
  search?: string;
  type?: ProductType;
  status?: ProductStatus;
}

export interface FindProductsResult {
  items: ProductRecord[];
  total: number;
}

export abstract class ProductsRepository {
  abstract create(data: CreateProductData): Promise<ProductRecord>;
  abstract findMany(options: FindProductsOptions): Promise<FindProductsResult>;
  abstract findById(id: string): Promise<ProductRecord | null>;
  abstract findByProductCode(productCode: string): Promise<ProductRecord | null>;
  abstract update(id: string, data: UpdateProductData): Promise<ProductRecord>;
  abstract softDelete(id: string, actorId: string): Promise<void>;
}
