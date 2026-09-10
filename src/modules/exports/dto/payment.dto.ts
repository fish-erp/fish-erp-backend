import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
export class PaymentInput {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999) amount!: number;
  @IsString() @IsNotEmpty() @MaxLength(100) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsDateString() paidAt?: string;
}
export class ReversalInput {
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}
export class ReconcileInput {
  @IsOptional() @IsUUID() customerId?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999) paidAmount!: number;
  @IsString() @IsNotEmpty() @MaxLength(500) note!: string;
}

