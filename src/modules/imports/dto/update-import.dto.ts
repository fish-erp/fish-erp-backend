import { PartialType } from '@nestjs/swagger';
import { CreateImportDto } from './create-import.dto.js';

export class UpdateImportDto extends PartialType(CreateImportDto) {}
