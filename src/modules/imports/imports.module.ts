import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ImportsController } from './controllers/imports.controller.js';
import { ImportsService } from './services/imports.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
