import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ExportsModule } from '../exports/exports.module.js';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';
@Module({ imports: [AuthModule, ExportsModule], controllers: [CustomersController], providers: [CustomersService] })
export class CustomersModule {}

