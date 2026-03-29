import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { ApiErrorResponses, ApiSuccessResponse } from '../../common/swagger';
import { AddToGuestCartDto, GuestCartResponseDto, UpdateGuestCartItemDto } from './dto';
import { GuestCartService } from './guest-cart.service';

const TOKEN_HEADER = 'x-guest-cart-token';

function requireToken(token: string | undefined): string {
  if (!token) {
    throw new BadRequestException(`Missing ${TOKEN_HEADER} header`);
  }
  return token;
}

@ApiTags('Guest Cart')
@Public()
@Controller('guest-cart')
export class GuestCartController {
  constructor(private readonly guestCartService: GuestCartService) {}

  @Get()
  @ApiOperation({ summary: 'View guest cart (requires token header)' })
  @ApiHeader({ name: TOKEN_HEADER, description: 'Guest cart session token', required: true })
  @ApiSuccessResponse(GuestCartResponseDto, 200, 'Cart retrieved')
  @ApiErrorResponses(400, 404, 429)
  getCart(
    @Headers(TOKEN_HEADER) token: string | undefined,
  ): ReturnType<GuestCartService['getCart']> {
    return this.guestCartService.getCart(requireToken(token));
  }

  @Post('items')
  @Throttle({
    short: { limit: 2, ttl: 1000 },
    medium: { limit: 10, ttl: 10000 },
    long: { limit: 30, ttl: 60000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add item to guest cart (creates cart if no token)' })
  @ApiHeader({ name: TOKEN_HEADER, description: 'Guest cart session token', required: false })
  @ApiSuccessResponse(GuestCartResponseDto, 200, 'Item added, token returned in header')
  @ApiErrorResponses(400, 404, 429)
  async addItem(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Body() dto: AddToGuestCartDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GuestCartResponseDto> {
    const result = await this.guestCartService.addItem(token || null, dto);

    // Return token in response header (client should store it)
    res.setHeader(TOKEN_HEADER, result.token);

    // Return cart without token in body
    const { token: _, ...cart } = result;
    return cart;
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update guest cart item quantity' })
  @ApiHeader({ name: TOKEN_HEADER, description: 'Guest cart session token', required: true })
  @ApiParam({ name: 'itemId', description: 'Cart item CUID' })
  @ApiSuccessResponse(GuestCartResponseDto, 200, 'Item updated')
  @ApiErrorResponses(400, 404, 429)
  updateItem(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateGuestCartItemDto,
  ): ReturnType<GuestCartService['updateItem']> {
    return this.guestCartService.updateItem(requireToken(token), itemId, dto);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove item from guest cart' })
  @ApiHeader({ name: TOKEN_HEADER, description: 'Guest cart session token', required: true })
  @ApiParam({ name: 'itemId', description: 'Cart item CUID' })
  @ApiSuccessResponse(GuestCartResponseDto, 200, 'Item removed')
  @ApiErrorResponses(400, 404, 429)
  removeItem(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Param('itemId') itemId: string,
  ): ReturnType<GuestCartService['removeItem']> {
    return this.guestCartService.removeItem(requireToken(token), itemId);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear all items from guest cart' })
  @ApiHeader({ name: TOKEN_HEADER, description: 'Guest cart session token', required: true })
  @ApiSuccessResponse(GuestCartResponseDto, 200, 'Cart cleared')
  @ApiErrorResponses(400, 404, 429)
  clearCart(
    @Headers(TOKEN_HEADER) token: string | undefined,
  ): ReturnType<GuestCartService['clearCart']> {
    return this.guestCartService.clearCart(requireToken(token));
  }
}
