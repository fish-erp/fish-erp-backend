import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListUsersQueryDto } from '../users/dto/list-users-query.dto.js';
export class CustomerInput {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(20) phoneNumber!: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
export class CustomerUpdate extends PartialType(CustomerInput) {
  @IsOptional() @IsBoolean() archived?: boolean;
}
export class CustomerQuery extends ListUsersQueryDto {
  @IsOptional() @IsIn(['true', 'false']) debtOnly?: string;
  @IsOptional() @IsIn(['true', 'false', 'all']) archived?: string;
}

