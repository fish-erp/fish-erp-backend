import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ExportsController } from './controllers/exports.controller.js';
import { ExportsService } from './services/exports.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ExportsController],
  providers: [ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
