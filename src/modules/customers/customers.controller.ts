import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../common/domain/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.js';
import { CustomerInput, CustomerQuery, CustomerUpdate } from './customers.dto.js';
import { CustomersService } from './customers.service.js';
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}
  @Get() list(@Query() query: CustomerQuery) { return this.service.list(query); }
  @Post() create(@Body() input: CustomerInput, @CurrentUser() actor: AuthenticatedUser) { return this.service.create(input, actor.id); }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string, @Query() query: CustomerQuery) { return this.service.detail(id, query); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() input: CustomerUpdate, @CurrentUser() actor: AuthenticatedUser) { return this.service.update(id, input, actor.id); }
}

