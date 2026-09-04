import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProductsModule } from '../products/products.module.js';
import { ImportsController } from './controllers/imports.controller.js';
import { ImportsRepository } from './repositories/imports.repository.js';
import { PrismaImportsRepository } from './repositories/prisma-imports.repository.js';
import { ImportsService } from './services/imports.service.js';

@Module({
  imports: [AuthModule, ProductsModule],
  controllers: [ImportsController],
  providers: [
    ImportsService,
    PrismaImportsRepository,
    {
      provide: ImportsRepository,
      useExisting: PrismaImportsRepository,
    },
  ],
  exports: [ImportsService],
})
export class ImportsModule {}
