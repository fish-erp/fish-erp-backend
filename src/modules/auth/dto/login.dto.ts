import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@gmail.com', description: 'Email hoặc số điện thoại Việt Nam' })
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  identifier!: string;

  @ApiProperty({ minLength: 8, writeOnly: true, example: '12345x@X' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
