import { ApiProperty } from '@nestjs/swagger';

export class TaxRateResponseDto {
  @ApiProperty({ example: 'cuid_abc123' })
  id!: string;

  @ApiProperty({ example: 'Standard VAT' })
  name!: string;

  @ApiProperty({
    example: '0.2300',
    description: 'Tax rate as decimal (0.23 = 23%)',
  })
  rate!: string;

  @ApiProperty({
    example: true,
    description: 'Whether this is the default tax rate',
  })
  isDefault!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether this rate is active',
  })
  isActive!: boolean;

  @ApiProperty({ example: '2026-02-06T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-02-06T10:00:00.000Z' })
  updatedAt!: Date;
}
