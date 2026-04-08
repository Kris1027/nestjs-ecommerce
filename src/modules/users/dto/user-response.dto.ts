import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Describes the user profile shape returned by the service's `profileSelect`
// Used by: GET /users/me, PATCH /users/me, GET /users/:id, PATCH /users/:id, GET /users (list)
export class UserProfileDto {
  @ApiProperty({ description: 'Unique user CUID', example: 'clxyz123abc456' })
  id!: string;

  @ApiProperty({ description: 'User email address', example: 'john@example.com' })
  email!: string;

  @ApiPropertyOptional({ description: 'User first name', example: 'John' })
  firstName!: string | null;

  @ApiPropertyOptional({ description: 'User last name', example: 'Doe' })
  lastName!: string | null;

  @ApiProperty({ description: 'User role', enum: ['CUSTOMER', 'ADMIN'], example: 'CUSTOMER' })
  role!: string;

  @ApiProperty({ description: 'Whether the account is active', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Account creation timestamp', example: '2025-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2025-01-15T12:00:00.000Z' })
  updatedAt!: Date;
}

// Describes the address shape returned by the service's `addressSelect`
// Used by: GET/POST/PATCH /users/me/addresses
export class UserAddressDto {
  @ApiProperty({ description: 'Unique address CUID', example: 'clxyz789def012' })
  id!: string;

  @ApiProperty({ description: 'Address type', enum: ['SHIPPING', 'BILLING'], example: 'SHIPPING' })
  type!: string;

  @ApiProperty({ description: 'Whether this is the default address for its type', example: true })
  isDefault!: boolean;

  @ApiProperty({ description: 'Recipient full name', example: 'John Doe' })
  fullName!: string;

  @ApiProperty({ description: 'Contact phone number', example: '+48123456789' })
  phone!: string;

  @ApiProperty({ description: 'Street address', example: 'ul. Marszalkowska 1' })
  street!: string;

  @ApiProperty({ description: 'City name', example: 'Warsaw' })
  city!: string;

  @ApiPropertyOptional({ description: 'Region or state', example: 'Mazowieckie' })
  region!: string | null;

  @ApiProperty({ description: 'Postal code', example: '00-001' })
  postalCode!: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code', example: 'PL' })
  country!: string;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  updatedAt!: Date;
}

// Generic message response for actions like password change, delete, deactivate
// Used by: POST /users/me/change-password, DELETE endpoints, POST deactivate
export class MessageResponseDto {
  @ApiProperty({
    description: 'Human-readable result message',
    example: 'Operation completed successfully',
  })
  message!: string;
}
