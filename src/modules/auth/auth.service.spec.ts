import { Test, type TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createMockPrismaClient, resetMockPrismaClient } from '@test/mocks/prisma.mock';
import {
  createMockConfigService,
  createMockJwtService,
  createMockEventEmitter,
  createMockEmailService,
  createMockGuestCartService,
} from '@test/mocks/common.mock';
import { createMockUser, sampleRegisterDto, sampleLoginDto } from '@test/fixtures/user.fixture';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import { GuestCartService } from '../guest-cart/guest-cart.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

// Mock bcrypt — real bcrypt is intentionally slow (12 rounds).
// In tests we want instant results.
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let emailService: ReturnType<typeof createMockEmailService>;
  let guestCartService: ReturnType<typeof createMockGuestCartService>;

  beforeEach(async () => {
    prisma = createMockPrismaClient();
    jwtService = createMockJwtService();
    configService = createMockConfigService();
    eventEmitter = createMockEventEmitter();
    emailService = createMockEmailService();
    guestCartService = createMockGuestCartService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: EmailService, useValue: emailService },
        { provide: GuestCartService, useValue: guestCartService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetMockPrismaClient(prisma);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user and return tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const mockUser = createMockUser({ email: sampleRegisterDto.email });
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({} as never);
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.register(sampleRegisterDto, 'Mozilla/5.0', '127.0.0.1');

      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: sampleRegisterDto.email },
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: sampleRegisterDto.email,
          password: 'hashed-password',
          firstName: sampleRegisterDto.firstName,
          lastName: sampleRegisterDto.lastName,
        },
      });

      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(emailService.send).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException if email already exists', async () => {
      const existingUser = createMockUser();
      prisma.user.findUnique.mockResolvedValue(existingUser);

      await expect(service.register(sampleRegisterDto)).rejects.toThrow(ConflictException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should hash the password with bcrypt before storing', async () => {
      const mockUser = createMockUser();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({} as never);
      prisma.user.update.mockResolvedValue(mockUser);

      await service.register(sampleRegisterDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(sampleRegisterDto.password, 12);
    });

    it('should merge guest cart on register when token provided', async () => {
      const mockUser = createMockUser({ email: sampleRegisterDto.email });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({} as never);
      prisma.user.update.mockResolvedValue(mockUser);

      await service.register(sampleRegisterDto, 'Mozilla/5.0', '127.0.0.1', 'guest-cart-token');

      expect(guestCartService.mergeIntoUserCart).toHaveBeenCalledWith(
        'guest-cart-token',
        mockUser.id,
      );
    });

    it('should not block registration if guest cart merge fails', async () => {
      const mockUser = createMockUser({ email: sampleRegisterDto.email });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({} as never);
      prisma.user.update.mockResolvedValue(mockUser);
      guestCartService.mergeIntoUserCart.mockRejectedValue(new Error('merge failed'));

      const result = await service.register(sampleRegisterDto, undefined, undefined, 'guest-token');

      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
      });
    });
  });

  describe('login', () => {
    it('should login and return tokens with valid credentials', async () => {
      const mockUser = createMockUser();
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({} as never);

      const result = await service.login(sampleLoginDto, 'Mozilla/5.0', '127.0.0.1');

      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: sampleLoginDto.email },
        select: { id: true, email: true, password: true, role: true, isActive: true },
      });
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const mockUser = createMockUser();
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(sampleLoginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(sampleLoginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for deactivated account', async () => {
      prisma.user.findUnique.mockResolvedValue(createMockUser({ isActive: false }));

      await expect(service.login(sampleLoginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should merge guest cart on login when token provided', async () => {
      const mockUser = createMockUser();
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({} as never);

      await service.login(sampleLoginDto, 'Mozilla/5.0', '127.0.0.1', 'guest-cart-token');

      expect(guestCartService.mergeIntoUserCart).toHaveBeenCalledWith(
        'guest-cart-token',
        mockUser.id,
      );
    });

    it('should not block login if guest cart merge fails', async () => {
      const mockUser = createMockUser();
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({} as never);
      guestCartService.mergeIntoUserCart.mockRejectedValue(new Error('merge failed'));

      const result = await service.login(sampleLoginDto, undefined, undefined, 'guest-token');

      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
      });
    });
  });

  describe('verifyEmail', () => {
    it('should verify email and send welcome email', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', firstName: 'John' };
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({} as never);

      const result = await service.verifyEmail('raw-verification-token');

      expect(result).toEqual({ message: 'Email verified successfully' });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          emailVerificationToken: expect.any(String),
          emailVerificationExpiry: { gt: expect.any(Date) },
        },
        select: { id: true, email: true, firstName: true },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          emailVerifiedAt: expect.any(Date),
          emailVerificationToken: null,
          emailVerificationExpiry: null,
        },
      });

      expect(emailService.send).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.verifyEmail('bad-token')).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('resendVerificationEmail', () => {
    it('should send verification email to unverified user', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'John',
        emailVerifiedAt: null,
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({} as never);

      const result = await service.resendVerificationEmail('test@example.com');

      expect(result.message).toContain('verification email has been sent');
      expect(emailService.send).toHaveBeenCalledTimes(1);
    });

    it('should return success without sending if email already verified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'John',
        emailVerifiedAt: new Date(),
      });

      const result = await service.resendVerificationEmail('test@example.com');

      expect(result.message).toContain('verification email has been sent');
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('should return success without sending if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.resendVerificationEmail('nobody@example.com');

      expect(result.message).toContain('verification email has been sent');
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('should send reset email to active user', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'John',
        isActive: true,
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({} as never);

      const result = await service.forgotPassword('test@example.com');

      expect(result.message).toContain('password reset email has been sent');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          passwordResetToken: expect.any(String),
          passwordResetExpiry: expect.any(Date),
        },
      });

      expect(emailService.send).toHaveBeenCalledTimes(1);
    });

    it('should return success without sending if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('nobody@example.com');

      expect(result.message).toContain('password reset email has been sent');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('should return success without sending if user is deactivated', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'John',
        isActive: false,
      });

      const result = await service.forgotPassword('test@example.com');

      expect(result.message).toContain('password reset email has been sent');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should reset password and revoke all sessions', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', firstName: 'John' };
      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.resetPassword('valid-reset-token', 'NewSecurePass123');

      expect(result.message).toContain('Password reset successfully');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(bcrypt.hash).toHaveBeenCalledWith('NewSecurePass123', 12);
      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException for invalid reset token', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.resetPassword('bad-token', 'NewPass123')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('refreshTokens', () => {
    it('should issue new token pair and revoke old token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        email: 'test@example.com',
        role: 'CUSTOMER',
      });

      prisma.refreshToken.findMany.mockResolvedValue([
        { id: 'token-1', tokenHash: 'stored-hash', tokenFamily: 'family-1' },
      ]);

      prisma.refreshToken.update.mockResolvedValue({} as never);
      prisma.refreshToken.create.mockResolvedValue({} as never);

      const result = await service.refreshTokens('valid-refresh-token', 'Mozilla/5.0', '127.0.0.1');

      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
      });

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: { isRevoked: true },
      });

      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          tokenFamily: 'family-1',
        }),
      });
    });

    it('should throw UnauthorizedException for invalid JWT', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(service.refreshTokens('bad-jwt')).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
    });

    it('should revoke ALL user tokens on reuse detection', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        email: 'test@example.com',
        role: 'CUSTOMER',
      });

      prisma.refreshToken.findMany.mockResolvedValue([
        { id: 'token-1', tokenHash: 'some-hash', tokenFamily: 'family-1' },
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.refreshTokens('stolen-token')).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { isRevoked: true },
      });
    });
  });

  describe('logout', () => {
    it('should revoke the matching refresh token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        email: 'test@example.com',
        role: 'CUSTOMER',
      });

      prisma.refreshToken.findMany.mockResolvedValue([{ id: 'token-1', tokenHash: 'stored-hash' }]);

      prisma.refreshToken.update.mockResolvedValue({} as never);

      await service.logout('valid-refresh-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: { isRevoked: true },
      });
    });

    it('should return silently if JWT is invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('expired');
      });

      await expect(service.logout('expired-token')).resolves.toBeUndefined();

      expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
    });

    it('should return silently if no matching token found', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        email: 'test@example.com',
        role: 'CUSTOMER',
      });

      prisma.refreshToken.findMany.mockResolvedValue([{ id: 'token-1', tokenHash: 'some-hash' }]);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.logout('unknown-token')).resolves.toBeUndefined();

      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });
});
