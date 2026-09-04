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
import { CreateProductDto } from '../dto/create-product.dto.js';
import { ListProductsQueryDto } from '../dto/list-products-query.dto.js';
import { ProductListResponseDto, ProductResponseDto } from '../dto/product-response.dto.js';
import { UpdateProductDto } from '../dto/update-product.dto.js';
import { ProductsService } from '../services/products.service.js';

@ApiTags('products')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'ADMIN role required' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a product' })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiConflictResponse({ description: 'Product code is already in use' })
  create(
    @Body() input: CreateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProductResponseDto> {
    return this.productsService.create(input, actor.id);
  }

  @Get()
  @ApiOperation({ summary: 'List products' })
  @ApiOkResponse({ type: ProductListResponseDto })
  findMany(@Query() query: ListProductsQueryDto): Promise<ProductListResponseDto> {
    return this.productsService.findMany(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  findById(@Param('id') id: string): Promise<ProductResponseDto> {
    return this.productsService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({ description: 'Product code is already in use' })
  update(
    @Param('id') id: string,
    @Body() input: UpdateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProductResponseDto> {
    return this.productsService.update(id, input, actor.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product' })
  @ApiNoContentResponse({ description: 'Product deleted' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  delete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    return this.productsService.delete(id, actor.id);
  }
}
