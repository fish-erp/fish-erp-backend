import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImportStatus } from '../../../common/domain/enums.js';
import { ProductsRepository } from '../../products/repositories/products.repository.js';
import type { CreateImportDto } from '../dto/create-import.dto.js';
import type {
  ImportListResponseDto,
  ImportResponseDto,
} from '../dto/import-response.dto.js';
import type { ListImportsQueryDto } from '../dto/list-imports-query.dto.js';
import type { UpdateImportDto } from '../dto/update-import.dto.js';
import type { ImportRecord } from '../repositories/imports.repository.js';
import { ImportsRepository } from '../repositories/imports.repository.js';

@Injectable()
export class ImportsService {
  constructor(
    private readonly importsRepository: ImportsRepository,
    private readonly productsRepository: ProductsRepository,
  ) {}

  async create(input: CreateImportDto, actorId: string): Promise<ImportResponseDto> {
    let importCode: string;
    if (input.importCode?.trim()) {
      importCode = input.importCode.trim();
      const existing = await this.importsRepository.findByImportCode(importCode);
      if (existing) {
        throw new ConflictException('Mã phiếu nhập đã tồn tại');
      }
    } else {
      importCode = await this.generateImportCode();
    }

    const status = input.status ?? ImportStatus.COMPLETED;
    const completedAt = status === ImportStatus.COMPLETED ? new Date() : null;

    // Trường hợp nhập danh sách nhiều sản phẩm trong 1 phiếu
    if (input.items && input.items.length > 0) {
      for (const item of input.items) {
        const product = await this.productsRepository.findById(item.productId);
        if (!product) {
          throw new NotFoundException(`Sản phẩm với ID ${item.productId} không tồn tại`);
        }
      }

      const createDataList = input.items.map((item) => ({
        importCode,
        productId: item.productId,
        importPrice: item.importPrice,
        importQuantity: item.importQuantity,
        expireDate: item.expireDate ? new Date(item.expireDate) : null,
        importNote: item.importNote?.trim() || input.importNote?.trim() || null,
        status,
        completedAt,
        createdBy: actorId,
        updatedBy: actorId,
      }));

      const createdRecords = await this.importsRepository.createManyWithStock(createDataList);
      const first = createdRecords[0];
      if (!first) {
        throw new BadRequestException('Không thể tạo phiếu nhập');
      }
      const res = this.toResponse(first);
      res.items = createdRecords.map((r) => this.toResponse(r));
      res.totalPrice = createdRecords.reduce(
        (sum, r) => sum + Number(r.importPrice) * r.importQuantity,
        0,
      );
      res.importQuantity = createdRecords.reduce((sum, r) => sum + r.importQuantity, 0);
      return res;
    }

    // Trường hợp nhập 1 sản phẩm đơn lẻ (fallback)
    if (!input.productId || !input.importQuantity || input.importPrice === undefined) {
      throw new BadRequestException('Vui lòng chọn sản phẩm và điền số lượng, đơn giá nhập');
    }

    const product = await this.productsRepository.findById(input.productId);
    if (!product) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    const record = await this.importsRepository.createWithStock({
      importCode,
      productId: input.productId,
      importPrice: input.importPrice,
      importQuantity: input.importQuantity,
      ...(input.expireDate ? { expireDate: new Date(input.expireDate) } : { expireDate: null }),
      ...(input.importNote?.trim() ? { importNote: input.importNote.trim() } : { importNote: null }),
      status,
      completedAt,
      createdBy: actorId,
      updatedBy: actorId,
    });

    const singleRes = this.toResponse(record);
    singleRes.items = [this.toResponse(record)];
    return singleRes;
  }

  async findMany(query: ListImportsQueryDto): Promise<ImportListResponseDto> {
    const fromDate = query.fromDate ? new Date(query.fromDate) : undefined;
    const toDate = query.toDate ? new Date(query.toDate) : undefined;

    const { items, total } = await this.importsRepository.findMany({
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      fromDate,
      toDate,
    });

    // Gom nhóm các dòng sản phẩm có chung importCode thành 1 phiếu nhập duy nhất
    const groupedMap = new Map<string, ImportRecord[]>();
    for (const item of items) {
      const list = groupedMap.get(item.importCode) ?? [];
      list.push(item);
      groupedMap.set(item.importCode, list);
    }

    const voucherList: ImportResponseDto[] = [];
    for (const [, groupItems] of groupedMap.entries()) {
      const primary = groupItems[0];
      if (!primary) continue;
      const resp = this.toResponse(primary);
      resp.items = groupItems.map((g) => this.toResponse(g));
      resp.totalPrice = groupItems.reduce(
        (sum, g) => sum + Number(g.importPrice) * g.importQuantity,
        0,
      );
      resp.importQuantity = groupItems.reduce((sum, g) => sum + g.importQuantity, 0);
      voucherList.push(resp);
    }

    return {
      data: voucherList,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  async findById(id: string): Promise<ImportResponseDto> {
    const record = await this.getImport(id);
    const siblings = await this.importsRepository.findItemsByImportCode(record.importCode);
    const res = this.toResponse(record);
    res.items = siblings.map((s) => this.toResponse(s));
    res.totalPrice = siblings.reduce(
      (sum, s) => sum + Number(s.importPrice) * s.importQuantity,
      0,
    );
    res.importQuantity = siblings.reduce((sum, s) => sum + s.importQuantity, 0);
    return res;
  }

  async update(id: string, input: UpdateImportDto, actorId: string): Promise<ImportResponseDto> {
    const current = await this.getImport(id);

    if (current.status === ImportStatus.CANCELLED) {
      throw new BadRequestException('Không thể chỉnh sửa phiếu nhập đã hủy');
    }

    if (current.status === ImportStatus.COMPLETED) {
      if (input.productId && input.productId !== current.productId) {
        throw new BadRequestException('Không thể thay đổi sản phẩm của phiếu nhập đã hoàn thành');
      }
      if (input.importQuantity && input.importQuantity !== current.importQuantity) {
        throw new BadRequestException('Không thể thay đổi số lượng của phiếu nhập đã hoàn thành');
      }
      if (input.status === ImportStatus.CANCELLED) {
        return this.cancel(id, actorId);
      }

      const updated = await this.importsRepository.update(id, {
        ...(input.importNote !== undefined ? { importNote: input.importNote?.trim() ?? null } : {}),
        updatedBy: actorId,
      });
      return this.findById(updated.id);
    }

    // current is DRAFT
    if (input.status === ImportStatus.COMPLETED) {
      if (input.productId || input.importQuantity || input.importPrice !== undefined) {
        await this.importsRepository.update(id, {
          ...(input.productId ? { productId: input.productId } : {}),
          ...(input.importPrice !== undefined ? { importPrice: input.importPrice } : {}),
          ...(input.importQuantity ? { importQuantity: input.importQuantity } : {}),
          ...(input.expireDate !== undefined ? { expireDate: input.expireDate ? new Date(input.expireDate) : null } : {}),
          ...(input.importNote !== undefined ? { importNote: input.importNote?.trim() ?? null } : {}),
          updatedBy: actorId,
        });
      }
      return this.complete(id, actorId);
    }

    if (input.status === ImportStatus.CANCELLED) {
      return this.cancel(id, actorId);
    }

    if (input.productId && input.productId !== current.productId) {
      const product = await this.productsRepository.findById(input.productId);
      if (!product) {
        throw new NotFoundException('Sản phẩm không tồn tại');
      }
    }

    if (input.importCode && input.importCode.trim() !== current.importCode) {
      const existing = await this.importsRepository.findByImportCode(input.importCode.trim());
      if (existing) {
        throw new ConflictException('Mã phiếu nhập đã tồn tại');
      }
    }

    const updated = await this.importsRepository.update(id, {
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.importPrice !== undefined ? { importPrice: input.importPrice } : {}),
      ...(input.importQuantity ? { importQuantity: input.importQuantity } : {}),
      ...(input.importCode ? { importCode: input.importCode.trim() } : {}),
      ...(input.expireDate !== undefined ? { expireDate: input.expireDate ? new Date(input.expireDate) : null } : {}),
      ...(input.importNote !== undefined ? { importNote: input.importNote?.trim() ?? null } : {}),
      updatedBy: actorId,
    });

    return this.findById(updated.id);
  }

  async complete(id: string, actorId: string): Promise<ImportResponseDto> {
    const current = await this.getImport(id);
    if (current.status === ImportStatus.COMPLETED) {
      return this.findById(current.id);
    }
    if (current.status === ImportStatus.CANCELLED) {
      throw new BadRequestException('Không thể hoàn thành phiếu đã hủy');
    }

    const completed = await this.importsRepository.completeWithStock(id, actorId);
    return this.findById(completed.id);
  }

  async cancel(id: string, actorId: string): Promise<ImportResponseDto> {
    const current = await this.getImport(id);
    if (current.status === ImportStatus.CANCELLED) {
      return this.findById(current.id);
    }

    const cancelled = await this.importsRepository.cancelWithStock(id, actorId);
    return this.findById(cancelled.id);
  }

  async delete(id: string, actorId: string): Promise<void> {
    await this.getImport(id);
    await this.importsRepository.softDeleteWithStock(id, actorId);
  }

  private async getImport(id: string): Promise<ImportRecord> {
    const record = await this.importsRepository.findById(id);
    if (!record) {
      throw new NotFoundException('Phiếu nhập kho không tồn tại');
    }
    return record;
  }

  private async generateImportCode(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `IMP-${year}${month}-`;

    const count = await this.importsRepository.countByMonth(prefix);
    let sequence = count + 1;
    let candidate = `${prefix}${String(sequence).padStart(4, '0')}`;

    while (await this.importsRepository.findByImportCode(candidate)) {
      sequence += 1;
      candidate = `${prefix}${String(sequence).padStart(4, '0')}`;
    }

    return candidate;
  }

  private toResponse(record: ImportRecord): ImportResponseDto {
    const importPrice = Number(record.importPrice);
    const totalPrice = importPrice * record.importQuantity;

    return {
      id: record.id,
      importCode: record.importCode,
      importPrice,
      importQuantity: record.importQuantity,
      totalPrice,
      expireDate: record.expireDate,
      importNote: record.importNote,
      status: record.status,
      completedAt: record.completedAt,
      cancelledAt: record.cancelledAt,
      productId: record.productId,
      product: record.product
        ? {
            id: record.product.id,
            productCode: record.product.productCode,
            productName: record.product.productName,
            productUnit: record.product.productUnit,
            productPrice: Number(record.product.productPrice),
            remainingQuantity: record.product.remainingQuantity,
            type: record.product.type,
            status: record.product.status,
          }
        : undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      createdBy: record.createdBy,
      updatedBy: record.updatedBy,
    };
  }
}
