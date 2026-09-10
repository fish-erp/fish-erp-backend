import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { PassThrough } from 'node:stream';
import { UserRole } from '../../../common/domain/enums.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { ExportReportQueryDto } from '../dto/export-report-query.dto.js';
import { ReportsService } from '../services/reports.service.js';

@ApiTags('reports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('inventory.xlsx')
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  inventory(@Query() query: ExportReportQueryDto, @Res() reply: FastifyReply): FastifyReply {
    const range = this.reportsService.parseRange(query);
    const output = new PassThrough();
    this.prepareReply(reply, `bao-cao-nhap-xuat-ton_${query.from}_${query.to}.xlsx`);
    void this.reportsService.writeInventory(output, range).catch((error: unknown) => output.destroy(error as Error));
    return reply.send(output);
  }

  @Get('sales.xlsx')
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  sales(@Query() query: ExportReportQueryDto, @Res() reply: FastifyReply): FastifyReply {
    const range = this.reportsService.parseRange(query);
    const output = new PassThrough();
    this.prepareReply(reply, `bao-cao-ban-hang_${query.from}_${query.to}.xlsx`);
    void this.reportsService.writeSales(output, range).catch((error: unknown) => output.destroy(error as Error));
    return reply.send(output);
  }

  private prepareReply(reply: FastifyReply, fileName: string): void {
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
    reply.header('Cache-Control', 'no-store');
  }
}
