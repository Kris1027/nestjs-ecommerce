import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

function createMockAuthService(): Record<keyof AuthService, jest.Mock> {
  return {
    register: jest.fn(),
    login: jest.fn(),
    refreshTokens: jest.fn(),
    logout: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerificationEmail: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };
}

// Helper: builds a minimal Express Request with user-agent and IP
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: { 'user-agent': 'TestAgent/1.0' },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as Request;
}

describe('AuthController', () => {
  let controller: AuthController;
  let service: ReturnType<typeof createMockAuthService>;

  beforeEach(async () => {
    service = createMockAuthService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should extract user-agent and IP from request and delegate to authService', async () => {
      const dto = { email: 'test@example.com', password: 'Password1' };
      const req = createMockRequest();
      const expected = { accessToken: 'at', refreshToken: 'rt' };
      service.register.mockResolvedValue(expected);

      const result = await controller.register(dto as any, req, undefined);

      // Controller extracts user-agent and IP from the raw request
      expect(service.register).toHaveBeenCalledWith(dto, 'TestAgent/1.0', '127.0.0.1', undefined);
      expect(result).toEqual(expected);
    });

    it('should fall back to socket.remoteAddress when req.ip is undefined', async () => {
      const dto = { email: 'test@example.com', password: 'Password1' };
      const req = createMockRequest({ ip: undefined });
      service.register.mockResolvedValue({});

      await controller.register(dto as any, req, undefined);

      expect(service.register).toHaveBeenCalledWith(dto, 'TestAgent/1.0', '127.0.0.1', undefined);
    });

    it('should pass guest cart token to authService on register', async () => {
      const dto = { email: 'test@example.com', password: 'Password1' };
      const req = createMockRequest();
      const guestCartToken = 'guest-token-123';
      service.register.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });

      await controller.register(dto as any, req, guestCartToken);

      expect(service.register).toHaveBeenCalledWith(
        dto,
        'TestAgent/1.0',
        '127.0.0.1',
        guestCartToken,
      );
    });
  });

  describe('login', () => {
    it('should pass DTO, request metadata, and guest cart token to authService', async () => {
      const dto = { email: 'test@example.com', password: 'Password1' };
      const req = createMockRequest();
      const guestCartToken = 'guest-token-123';
      const expected = { accessToken: 'at', refreshToken: 'rt' };
      service.login.mockResolvedValue(expected);

      const result = await controller.login(dto as any, req, guestCartToken);

      expect(service.login).toHaveBeenCalledWith(dto, 'TestAgent/1.0', '127.0.0.1', guestCartToken);
      expect(result).toEqual(expected);
    });

    it('should pass undefined when no guest cart token provided', async () => {
      const dto = { email: 'test@example.com', password: 'Password1' };
      const req = createMockRequest();
      service.login.mockResolvedValue({});

      await controller.login(dto as any, req, undefined);

      expect(service.login).toHaveBeenCalledWith(dto, 'TestAgent/1.0', '127.0.0.1', undefined);
    });
  });

  describe('refresh', () => {
    it('should extract refresh token from DTO and pass request metadata', async () => {
      const dto = { refreshToken: 'rt-123' };
      const req = createMockRequest();
      const expected = { accessToken: 'new-at', refreshToken: 'new-rt' };
      service.refreshTokens.mockResolvedValue(expected);

      const result = await controller.refresh(dto as any, req);

      // Controller passes dto.refreshToken (not the whole DTO)
      expect(service.refreshTokens).toHaveBeenCalledWith('rt-123', 'TestAgent/1.0', '127.0.0.1');
      expect(result).toEqual(expected);
    });
  });

  describe('logout', () => {
    it('should call authService.logout and return success message', async () => {
      const dto = { refreshToken: 'rt-123' };
      service.logout.mockResolvedValue(undefined);

      const result = await controller.logout(dto as any);

      expect(service.logout).toHaveBeenCalledWith('rt-123');
      // Controller constructs the response itself — service returns void
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('verifyEmail', () => {
    it('should call authService.verifyEmail with the token param', async () => {
      const expected = { message: 'Email verified' };
      service.verifyEmail.mockResolvedValue(expected);

      const result = await controller.verifyEmail('verify-token-123');

      expect(service.verifyEmail).toHaveBeenCalledWith('verify-token-123');
      expect(result).toEqual(expected);
    });
  });

  describe('resendVerification', () => {
    it('should call authService.resendVerificationEmail with dto.email', async () => {
      const dto = { email: 'test@example.com' };
      const expected = { message: 'Verification email sent' };
      service.resendVerificationEmail.mockResolvedValue(expected);

      const result = await controller.resendVerification(dto as any);

      expect(service.resendVerificationEmail).toHaveBeenCalledWith('test@example.com');
      expect(result).toEqual(expected);
    });
  });

  describe('forgotPassword', () => {
    it('should call authService.forgotPassword with dto.email', async () => {
      const dto = { email: 'test@example.com' };
      const expected = { message: 'Reset email sent' };
      service.forgotPassword.mockResolvedValue(expected);

      const result = await controller.forgotPassword(dto as any);

      expect(service.forgotPassword).toHaveBeenCalledWith('test@example.com');
      expect(result).toEqual(expected);
    });
  });

  describe('resetPassword', () => {
    it('should call authService.resetPassword with token and password from DTO', async () => {
      const dto = { token: 'reset-token', password: 'NewPass123' };
      const expected = { message: 'Password reset' };
      service.resetPassword.mockResolvedValue(expected);

      const result = await controller.resetPassword(dto as any);

      // Controller destructures DTO — passes individual fields
      expect(service.resetPassword).toHaveBeenCalledWith('reset-token', 'NewPass123');
      expect(result).toEqual(expected);
    });
  });
});
