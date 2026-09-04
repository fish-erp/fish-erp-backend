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
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../common/domain/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.js';
import { CreateImportDto } from '../dto/create-import.dto.js';
import { ImportListResponseDto, ImportResponseDto } from '../dto/import-response.dto.js';
import { ListImportsQueryDto } from '../dto/list-imports-query.dto.js';
import { UpdateImportDto } from '../dto/update-import.dto.js';
import { ImportsService } from '../services/imports.service.js';

@ApiTags('imports')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'ADMIN role required' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo phiếu nhập kho' })
  @ApiCreatedResponse({ type: ImportResponseDto })
  @ApiConflictResponse({ description: 'Mã phiếu nhập đã tồn tại' })
  @ApiNotFoundResponse({ description: 'Sản phẩm không tồn tại' })
  create(
    @Body() input: CreateImportDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ImportResponseDto> {
    return this.importsService.create(input, actor.id);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách phiếu nhập kho' })
  @ApiOkResponse({ type: ImportListResponseDto })
  findMany(@Query() query: ListImportsQueryDto): Promise<ImportListResponseDto> {
    return this.importsService.findMany(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết phiếu nhập kho' })
  @ApiOkResponse({ type: ImportResponseDto })
  @ApiNotFoundResponse({ description: 'Phiếu nhập không tồn tại' })
  findById(@Param('id') id: string): Promise<ImportResponseDto> {
    return this.importsService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật phiếu nhập kho' })
  @ApiOkResponse({ type: ImportResponseDto })
  @ApiNotFoundResponse({ description: 'Phiếu nhập không tồn tại' })
  @ApiConflictResponse({ description: 'Mã phiếu nhập đã tồn tại' })
  update(
    @Param('id') id: string,
    @Body() input: UpdateImportDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ImportResponseDto> {
    return this.importsService.update(id, input, actor.id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Hoàn thành phiếu nhập kho (cộng tồn kho)' })
  @ApiOkResponse({ type: ImportResponseDto })
  @ApiNotFoundResponse({ description: 'Phiếu nhập không tồn tại' })
  complete(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ImportResponseDto> {
    return this.importsService.complete(id, actor.id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Hủy phiếu nhập kho (trừ lại tồn kho nếu đã hoàn thành)' })
  @ApiOkResponse({ type: ImportResponseDto })
  @ApiNotFoundResponse({ description: 'Phiếu nhập không tồn tại' })
  cancel(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ImportResponseDto> {
    return this.importsService.cancel(id, actor.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa phiếu nhập kho' })
  @ApiNoContentResponse({ description: 'Đã xóa phiếu nhập kho' })
  @ApiNotFoundResponse({ description: 'Phiếu nhập không tồn tại' })
  delete(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.importsService.delete(id, actor.id);
  }
}
