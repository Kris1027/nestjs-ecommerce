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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, Roles } from '../../common/decorators';
import {
  AdminUpdateUserDto,
  ChangePasswordDto,
  CreateAddressDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ============================================
  // USER ENDPOINTS
  // ============================================

  @Get('me')
  getProfile(@CurrentUser('sub') userId: string): ReturnType<UsersService['getProfile']> {
    return this.usersService.getProfile(userId);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
  ): ReturnType<UsersService['updateProfile']> {
    return this.usersService.updateProfile(userId, dto);
  }

  @Post('me/change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ): ReturnType<UsersService['changePassword']> {
    return this.usersService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  // ============================================
  // ADDRESS ENDPOINTS
  // ============================================

  @Get('me/addresses')
  getAddresses(@CurrentUser('sub') userId: string): ReturnType<UsersService['getAddresses']> {
    return this.usersService.getAddresses(userId);
  }

  @Post('me/addresses')
  createAddress(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateAddressDto,
  ): ReturnType<UsersService['createAddress']> {
    return this.usersService.createAddress(userId, dto);
  }

  @Get('me/addresses/:id')
  getAddress(
    @CurrentUser('sub') userId: string,
    @Param('id') addressId: string,
  ): ReturnType<UsersService['getAddress']> {
    return this.usersService.getAddress(userId, addressId);
  }

  @Patch('me/addresses/:id')
  updateAddress(
    @CurrentUser('sub') userId: string,
    @Param('id') addressId: string,
    @Body() dto: UpdateAddressDto,
  ): ReturnType<UsersService['updateAddress']> {
    return this.usersService.updateAddress(userId, addressId, dto);
  }

  @Delete('me/addresses/:id')
  deleteAddress(
    @CurrentUser('sub') userId: string,
    @Param('id') addressId: string,
  ): ReturnType<UsersService['deleteAddress']> {
    return this.usersService.deleteAddress(userId, addressId);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  @Get()
  @Roles('ADMIN')
  findAll(@Query() query: PaginationQueryDto): ReturnType<UsersService['findAll']> {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN')
  findById(@Param('id') userId: string): ReturnType<UsersService['findById']> {
    return this.usersService.findById(userId);
  }

  @Patch(':id')
  @Roles('ADMIN')
  adminUpdateUser(
    @Param('id') userId: string,
    @Body() dto: AdminUpdateUserDto,
  ): ReturnType<UsersService['adminUpdateUser']> {
    return this.usersService.adminUpdateUser(userId, dto);
  }

  @Post(':id/deactivate')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  deactivateUser(@Param('id') userId: string): ReturnType<UsersService['deactivateUser']> {
    return this.usersService.deactivateUser(userId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  hardDeleteUser(@Param('id') userId: string): ReturnType<UsersService['hardDeleteUser']> {
    return this.usersService.hardDeleteUser(userId);
  }
}
