import { Global, Module } from '@nestjs/common';
import { DocumentSequenceService } from './document-sequence.service.js';
import { InventoryStockService } from './inventory-stock.service.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService, DocumentSequenceService, InventoryStockService],
  exports: [PrismaService, DocumentSequenceService, InventoryStockService],
})
export class PrismaModule {}
