import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { Env } from '../../config/env.validation';
import { RegisterDto, LoginDto } from './dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents, PasswordChangedEvent } from '../notifications/events';
import { EmailService } from '../notifications/email.service';
import { GuestCartService } from '../guest-cart/guest-cart.service';
import {
  emailVerificationEmail,
  passwordResetEmail,
  welcomeEmail,
} from '../notifications/email-templates';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

const PASSWORD_BCRYPT_ROUNDS = 12;
const TOKEN_BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>,
    private readonly eventEmitter: EventEmitter2,
    private readonly emailService: EmailService,
    private readonly guestCartService: GuestCartService,
  ) {}

  // ============================================
  // HELPER METHODS
  // ============================================

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS);
  }

  private async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  private generateAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }

  private generateRefreshToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN'),
    });
  }

  private async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, TOKEN_BCRYPT_ROUNDS);
  }

  /**
   * SHA-256 hash for verification/reset tokens.
   * Unlike bcrypt, SHA-256 is deterministic — same input always produces same output.
   * This allows O(1) database lookup instead of O(n) bcrypt comparisons.
   * Safe for high-entropy tokens (32 random bytes) where slow hashing isn't needed.
   */
  private hashTokenSha256(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getRefreshTokenExpiry(): Date {
    const expiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN');
    const ms = this.parseExpiry(expiresIn);
    return new Date(Date.now() + ms);
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }

    const value = parseInt(match[1]!, 10);
    const unit = match[2]!;

    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * multipliers[unit]!;
  }

  private generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }

  private async sendVerificationEmail(
    userId: string,
    email: string,
    firstName: string | null,
  ): Promise<void> {
    const rawToken = this.generateSecureToken();
    // Use SHA-256 for O(1) lookup instead of bcrypt's O(n) comparison
    const hashedToken = this.hashTokenSha256(rawToken);
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: hashedToken,
        emailVerificationExpiry: expiry,
      },
    });

    const verifyUrl = `${this.configService.get('STORE_URL')}/verify-email?token=${rawToken}`;
    const { subject, html } = emailVerificationEmail(firstName, verifyUrl);

    await this.emailService.send(email, subject, html);
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  async register(
    dto: RegisterDto,
    userAgent?: string,
    ipAddress?: string,
    guestCartToken?: string,
  ): Promise<TokenResponse> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    const tokenFamily = randomUUID();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await this.hashToken(refreshToken),
        tokenFamily,
        userAgent,
        ipAddress,
        expiresAt: this.getRefreshTokenExpiry(),
      },
    });

    // Send verification email (verification-first)
    await this.sendVerificationEmail(user.id, user.email, user.firstName);

    // Merge guest cart into user cart if token provided
    if (guestCartToken) {
      try {
        await this.guestCartService.mergeIntoUserCart(guestCartToken, user.id);
      } catch {
        // Ignore merge errors - don't block registration
      }
    }

    return { accessToken, refreshToken };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    // SHA-256 hash allows direct O(1) database lookup
    const hashedToken = this.hashTokenSha256(token);

    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: hashedToken,
        emailVerificationExpiry: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    // Mark email as verified and clear token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    // Send welcome email now that email is verified
    const { subject, html } = welcomeEmail(user.firstName);
    await this.emailService.send(user.email, subject, html);

    return { message: 'Email verified successfully' };
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
    });

    // Always return success to prevent email enumeration
    const successMessage = {
      message: 'If an unverified account exists, a verification email has been sent',
    };

    if (!user || user.emailVerifiedAt) {
      return successMessage;
    }

    await this.sendVerificationEmail(user.id, user.email, user.firstName);

    return successMessage;
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, isActive: true },
    });

    // Always return success to prevent email enumeration
    const successMessage = {
      message: 'If an account exists, a password reset email has been sent',
    };

    if (!user || !user.isActive) {
      return successMessage;
    }

    const rawToken = this.generateSecureToken();
    // Use SHA-256 for O(1) lookup instead of bcrypt's O(n) comparison
    const hashedToken = this.hashTokenSha256(rawToken);
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedToken,
        passwordResetExpiry: expiry,
      },
    });

    const resetUrl = `${this.configService.get('STORE_URL')}/reset-password?token=${rawToken}`;
    const { subject, html } = passwordResetEmail(user.firstName, resetUrl);

    await this.emailService.send(user.email, subject, html);

    return successMessage;
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    // SHA-256 hash allows direct O(1) database lookup
    const hashedToken = this.hashTokenSha256(token);

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpiry: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const hashedPassword = await this.hashPassword(newPassword);

    // Update password, clear token, and revoke all refresh tokens
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpiry: null,
        },
      }),
      // Invalidate all sessions for security
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { isRevoked: true },
      }),
    ]);

    // Notify user that password was changed
    this.eventEmitter.emit(
      NotificationEvents.PASSWORD_CHANGED,
      new PasswordChangedEvent(user.id, user.email, user.firstName),
    );

    return { message: 'Password reset successfully. Please log in with your new password.' };
  }

  async login(
    dto: LoginDto,
    userAgent?: string,
    ipAddress?: string,
    guestCartToken?: string,
  ): Promise<TokenResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !(await this.verifyPassword(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Merge guest cart into user cart if token provided
    if (guestCartToken) {
      try {
        await this.guestCartService.mergeIntoUserCart(guestCartToken, user.id);
      } catch {
        // Ignore merge errors - don't block login
      }
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    const tokenFamily = randomUUID();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await this.hashToken(refreshToken),
        tokenFamily,
        userAgent,
        ipAddress,
        expiresAt: this.getRefreshTokenExpiry(),
      },
    });

    return { accessToken, refreshToken };
  }

  async refreshTokens(
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenResponse> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const userTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId: payload.sub,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        tokenHash: true,
        tokenFamily: true,
      },
    });

    let matchedToken: { id: string; tokenHash: string; tokenFamily: string } | null = null;
    for (const token of userTokens) {
      const isMatch = await bcrypt.compare(refreshToken, token.tokenHash);
      if (isMatch) {
        matchedToken = token;
        break;
      }
    }

    if (!matchedToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: payload.sub },
        data: { isRevoked: true },
      });
      throw new UnauthorizedException('Refresh token revoked');
    }

    await this.prisma.refreshToken.update({
      where: { id: matchedToken.id },
      data: { isRevoked: true },
    });

    const newPayload: JwtPayload = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    const newAccessToken = this.generateAccessToken(newPayload);
    const newRefreshToken = this.generateRefreshToken(newPayload);

    await this.prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash: await this.hashToken(newRefreshToken),
        tokenFamily: matchedToken.tokenFamily,
        userAgent,
        ipAddress,
        expiresAt: this.getRefreshTokenExpiry(),
      },
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      // Token invalid or expired - consider it "logged out" already
      return;
    }

    const userTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId: payload.sub,
        isRevoked: false,
      },
      select: {
        id: true,
        tokenHash: true,
      },
    });

    for (const token of userTokens) {
      const isMatch = await bcrypt.compare(refreshToken, token.tokenHash);
      if (isMatch) {
        await this.prisma.refreshToken.update({
          where: { id: token.id },
          data: { isRevoked: true },
        });
        break;
      }
    }
  }
}
