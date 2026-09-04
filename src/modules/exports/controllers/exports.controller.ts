import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../../common/domain/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.js';
import { CreateExportDto } from '../dto/create-export.dto.js';
import type { ExportListResponseDto, ExportResponseDto } from '../dto/export-response.dto.js';
import { ListExportsQueryDto } from '../dto/list-exports-query.dto.js';
import { UpdateExportDto } from '../dto/update-export.dto.js';
import { ExportsService } from '../services/exports.service.js';

@ApiTags('exports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo phiếu xuất nhiều sản phẩm' })
  create(@Body() input: CreateExportDto, @CurrentUser() actor: AuthenticatedUser): Promise<ExportResponseDto> {
    return this.exportsService.create(input, actor.id);
  }

  @Get()
  findMany(@Query() query: ListExportsQueryDto): Promise<ExportListResponseDto> {
    return this.exportsService.findMany(query);
  }

  @Get(':id')
  findById(@Param('id') id: string): Promise<ExportResponseDto> {
    return this.exportsService.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() input: UpdateExportDto, @CurrentUser() actor: AuthenticatedUser): Promise<ExportResponseDto> {
    return this.exportsService.update(id, input, actor.id);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser): Promise<ExportResponseDto> {
    return this.exportsService.complete(id, actor.id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser): Promise<ExportResponseDto> {
    return this.exportsService.cancel(id, actor.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    return this.exportsService.delete(id, actor.id);
  }
}
