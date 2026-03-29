import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService, type TokenResponse } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  TokenResponseDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ResendVerificationDto,
} from './dto';
import { Public } from '../../common/decorators';
import { MessageResponseDto } from '../users/dto';
import { ApiSuccessResponse, ApiErrorResponses } from '../../common/swagger';

@ApiTags('Auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({
    short: { limit: 1, ttl: 1000 },
    medium: { limit: 5, ttl: 10000 },
    long: { limit: 10, ttl: 60000 },
  })
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiSuccessResponse(TokenResponseDto, 201, 'User registered successfully')
  @ApiErrorResponses(400, 409, 429)
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<TokenResponse> {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

    return this.authService.register(dto, userAgent, ipAddress);
  }

  @Post('login')
  @Throttle({
    short: { limit: 1, ttl: 1000 },
    medium: { limit: 5, ttl: 10000 },
    long: { limit: 10, ttl: 60000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiHeader({
    name: 'x-guest-cart-token',
    description: 'Guest cart token to merge on login',
    required: false,
  })
  @ApiSuccessResponse(TokenResponseDto, 200, 'Login successful')
  @ApiErrorResponses(400, 401, 429)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Headers('x-guest-cart-token') guestCartToken?: string,
  ): Promise<TokenResponse> {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

    return this.authService.login(dto, userAgent, ipAddress, guestCartToken);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange refresh token for new token pair' })
  @ApiSuccessResponse(TokenResponseDto, 200, 'Tokens refreshed')
  @ApiErrorResponses(400, 401, 429)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<TokenResponse> {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

    return this.authService.refreshTokens(dto.refreshToken, userAgent, ipAddress);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate a refresh token' })
  @ApiSuccessResponse(MessageResponseDto, 200, 'Logged out successfully')
  @ApiErrorResponses(400, 429)
  async logout(@Body() dto: RefreshTokenDto): Promise<{ message: string }> {
    await this.authService.logout(dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Get('verify-email/:token')
  @ApiOperation({ summary: 'Verify email address with token from email link' })
  @ApiSuccessResponse(MessageResponseDto, 200, 'Email verified successfully')
  @ApiErrorResponses(401, 429)
  verifyEmail(@Param('token') token: string): Promise<{ message: string }> {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  @Throttle({
    short: { limit: 1, ttl: 1000 },
    medium: { limit: 5, ttl: 10000 },
    long: { limit: 10, ttl: 60000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiSuccessResponse(MessageResponseDto, 200, 'Verification email sent if account exists')
  @ApiErrorResponses(400, 429)
  resendVerification(@Body() dto: ResendVerificationDto): Promise<{ message: string }> {
    return this.authService.resendVerificationEmail(dto.email);
  }

  @Post('forgot-password')
  @Throttle({
    short: { limit: 1, ttl: 1000 },
    medium: { limit: 5, ttl: 10000 },
    long: { limit: 10, ttl: 60000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiSuccessResponse(MessageResponseDto, 200, 'Password reset email sent if account exists')
  @ApiErrorResponses(400, 429)
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Throttle({
    short: { limit: 1, ttl: 1000 },
    medium: { limit: 3, ttl: 10000 },
    long: { limit: 5, ttl: 60000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token from email' })
  @ApiSuccessResponse(MessageResponseDto, 200, 'Password reset successfully')
  @ApiErrorResponses(400, 401, 429)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}
