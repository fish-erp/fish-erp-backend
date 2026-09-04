import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class ExportReportQueryDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsDateString({ strict: true })
  from!: string;

  @ApiProperty({ example: '2026-09-30' })
  @IsDateString({ strict: true })
  to!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includePrice = false;
}
