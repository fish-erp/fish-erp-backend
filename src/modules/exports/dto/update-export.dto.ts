import { PartialType } from '@nestjs/swagger';
import { CreateExportDto } from './create-export.dto.js';

export class UpdateExportDto extends PartialType(CreateExportDto) {}
