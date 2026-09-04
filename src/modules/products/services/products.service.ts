import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductStatus, ProductType } from '../../../common/domain/enums.js';
import type { CreateProductDto } from '../dto/create-product.dto.js';
import type { ListProductsQueryDto } from '../dto/list-products-query.dto.js';
import type { ProductListResponseDto, ProductResponseDto } from '../dto/product-response.dto.js';
import type { UpdateProductDto } from '../dto/update-product.dto.js';
import type { ProductRecord } from '../repositories/products.repository.js';
import { ProductsRepository } from '../repositories/products.repository.js';

@Injectable()
export class ProductsService {
  constructor(private readonly productsRepository: ProductsRepository) {}

  async create(input: CreateProductDto, actorId: string): Promise<ProductResponseDto> {
    const productCode = input.productCode.trim();
    await this.ensureProductCodeAvailable(productCode);

    const product = await this.productsRepository.create({
      productCode,
      productName: input.productName.trim(),
      productPrice: input.productPrice,
      productUnit: input.productUnit.trim(),
      ...(input.productNote === undefined ? {} : { productNote: input.productNote.trim() }),
      type: input.type ?? ProductType.UNKNOWN,
      status: input.status ?? ProductStatus.SELLING,
      createdBy: actorId,
      updatedBy: actorId,
    });

    return this.toResponse(product);
  }

  async findMany(query: ListProductsQueryDto): Promise<ProductListResponseDto> {
    const { items, total } = await this.productsRepository.findMany({
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    });

    return {
      data: items.map((item) => this.toResponse(item)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findById(id: string): Promise<ProductResponseDto> {
    return this.toResponse(await this.getProduct(id));
  }

  async update(id: string, input: UpdateProductDto, actorId: string): Promise<ProductResponseDto> {
    const currentProduct = await this.getProduct(id);
    const productCode = input.productCode?.trim();

    if (productCode && productCode !== currentProduct.productCode) {
      await this.ensureProductCodeAvailable(productCode);
    }

    const product = await this.productsRepository.update(id, {
      ...(productCode === undefined ? {} : { productCode }),
      ...(input.productName === undefined ? {} : { productName: input.productName.trim() }),
      ...(input.productPrice === undefined ? {} : { productPrice: input.productPrice }),
      ...(input.productUnit === undefined ? {} : { productUnit: input.productUnit.trim() }),
      ...(input.productNote === undefined ? {} : { productNote: input.productNote.trim() }),
      ...(input.type === undefined ? {} : { type: input.type }),
      ...(input.status === undefined ? {} : { status: input.status }),
      updatedBy: actorId,
    });

    return this.toResponse(product);
  }

  async delete(id: string, actorId: string): Promise<void> {
    await this.getProduct(id);
    await this.productsRepository.softDelete(id, actorId);
  }

  private async getProduct(id: string): Promise<ProductRecord> {
    const product = await this.productsRepository.findById(id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private async ensureProductCodeAvailable(productCode: string): Promise<void> {
    if (await this.productsRepository.findByProductCode(productCode)) {
      throw new ConflictException('Product code is already in use');
    }
  }

  private toResponse(product: ProductRecord): ProductResponseDto {
    return {
      id: product.id,
      productCode: product.productCode,
      productName: product.productName,
      productPrice: Number(product.productPrice),
      remainingQuantity: product.remainingQuantity,
      productUnit: product.productUnit,
      productNote: product.productNote,
      type: product.type,
      status: product.status,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
