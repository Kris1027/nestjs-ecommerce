import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators';
import { ChangePasswordDto, UpdateProfileDto } from './dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}
