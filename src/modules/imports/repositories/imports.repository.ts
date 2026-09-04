import type * as runtime from '@prisma/client/runtime/client';
import type { ImportStatus } from '../../../common/domain/enums.js';
import type { ProductRecord } from '../../products/repositories/products.repository.js';

export interface ImportRecord {
  id: string;
  importCode: string;
  importPrice: runtime.Decimal;
  importQuantity: number;
  expireDate: Date | null;
  importNote: string | null;
  status: ImportStatus;
  completedAt: Date | null;
  cancelledAt: Date | null;
  productId: string;
  product?: ProductRecord;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
  deleteAt: Date | null;
  deleteBy: string | null;
}

export interface CreateImportData {
  importCode: string;
  productId: string;
  importPrice: number;
  importQuantity: number;
  expireDate?: Date | null;
  importNote?: string | null;
  status: ImportStatus;
  completedAt?: Date | null;
  createdBy?: string;
  updatedBy?: string;
}

export interface UpdateImportData {
  productId?: string;
  importPrice?: number;
  importQuantity?: number;
  importCode?: string;
  expireDate?: Date | null;
  importNote?: string | null;
  status?: ImportStatus;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  updatedBy?: string;
}

export interface FindImportsOptions {
  skip: number;
  take: number;
  search?: string;
  status?: ImportStatus;
  productId?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface FindImportsResult {
  items: ImportRecord[];
  total: number;
}

export abstract class ImportsRepository {
  abstract createWithStock(data: CreateImportData): Promise<ImportRecord>;
  abstract createManyWithStock(items: CreateImportData[]): Promise<ImportRecord[]>;
  abstract findMany(options: FindImportsOptions): Promise<FindImportsResult>;
  abstract findById(id: string): Promise<ImportRecord | null>;
  abstract findByImportCode(importCode: string): Promise<ImportRecord | null>;
  abstract findItemsByImportCode(importCode: string): Promise<ImportRecord[]>;
  abstract countByMonth(yearMonthPrefix: string): Promise<number>;
  abstract completeWithStock(id: string, actorId: string): Promise<ImportRecord>;
  abstract cancelWithStock(id: string, actorId: string): Promise<ImportRecord>;
  abstract update(id: string, data: UpdateImportData): Promise<ImportRecord>;
  abstract softDeleteWithStock(id: string, actorId: string): Promise<void>;
}
