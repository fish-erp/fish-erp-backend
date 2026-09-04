import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProductsController } from './controllers/products.controller.js';
import { PrismaProductsRepository } from './repositories/prisma-products.repository.js';
import { ProductsRepository } from './repositories/products.repository.js';
import { ProductsService } from './services/products.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    PrismaProductsRepository,
    {
      provide: ProductsRepository,
      useExisting: PrismaProductsRepository,
    },
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
