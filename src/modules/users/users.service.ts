import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { AdminUpdateUserDto, UpdateProfileDto } from './dto';
import type { CreateAddressDto, UpdateAddressDto } from './dto';
import {
  getPrismaPageArgs,
  paginate,
  type PaginatedResult,
} from '../../common/utils/pagination.util';
import type { PaginationQuery } from '../../common/dto/pagination.dto';

const profileSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PASSWORD_BCRYPT_ROUNDS = 12;

type UserProfile = Prisma.UserGetPayload<{ select: typeof profileSelect }>;

const addressSelect = {
  id: true,
  type: true,
  isDefault: true,
  fullName: true,
  phone: true,
  street: true,
  city: true,
  region: true,
  postalCode: true,
  country: true,
  createdAt: true,
  updatedAt: true,
} as const;

type UserAddress = Prisma.AddressGetPayload<{ select: typeof addressSelect }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // USER METHODS
  // ============================================

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateProfile(userId: string, data: UpdateProfileDto): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: profileSelect,
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, PASSWORD_BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  // ============================================
  // ADDRESS METHODS
  // ============================================

  async getAddresses(userId: string): Promise<UserAddress[]> {
    return this.prisma.address.findMany({
      where: { userId },
      select: addressSelect,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getAddress(userId: string, addressId: string): Promise<UserAddress> {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
      select: { ...addressSelect, userId: true },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.userId !== userId) {
      throw new ForbiddenException('You do not have access to this address');
    }

    return address;
  }

  async createAddress(userId: string, data: CreateAddressDto): Promise<UserAddress> {
    if (data.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, type: data.type, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.create({
      data: { ...data, userId },
      select: addressSelect,
    });
  }

  async updateAddress(
    userId: string,
    addressId: string,
    data: UpdateAddressDto,
  ): Promise<UserAddress> {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
      select: { userId: true, type: true },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.userId !== userId) {
      throw new ForbiddenException('You do not have access to this address');
    }

    if (data.isDefault) {
      const type = data.type ?? address.type;
      await this.prisma.address.updateMany({
        where: { userId, type, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.update({
      where: { id: addressId },
      data,
      select: addressSelect,
    });
  }

  async deleteAddress(userId: string, addressId: string): Promise<{ message: string }> {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
      select: { userId: true },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.userId !== userId) {
      throw new ForbiddenException('You do not have access to this address');
    }

    await this.prisma.address.delete({
      where: { id: addressId },
    });

    return { message: 'Address deleted successfully' };
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async findAll(query: PaginationQuery): Promise<PaginatedResult<UserProfile>> {
    const { skip, take } = getPrismaPageArgs(query);

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        select: profileSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count(),
    ]);

    return paginate(users, total, query);
  }

  async findById(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async adminUpdateUser(userId: string, data: AdminUpdateUserDto): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: profileSelect,
    });
  }

  async softDeleteUser(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive) {
      throw new BadRequestException('User is already deactivated');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    return { message: 'User deactivated successfully' };
  }
}
