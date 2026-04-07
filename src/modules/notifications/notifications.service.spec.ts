import { Test, type TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { createMockPrismaClient, resetMockPrismaClient } from '@test/mocks/prisma.mock';
import { createMockEmailService } from '@test/mocks/common.mock';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import { NotFoundException } from '@nestjs/common';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let emailService: ReturnType<typeof createMockEmailService>;

  beforeEach(async () => {
    prisma = createMockPrismaClient();
    emailService = createMockEmailService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetMockPrismaClient(prisma);
  });

  const userId = 'cluser123456789012345678';
  const notificationId = 'clnotif12345678901234567';

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('notify', () => {
    const baseParams = {
      userId,
      type: 'ORDER_CREATED' as const,
      title: 'Order Created',
      body: 'Your order has been created.',
      referenceId: 'order123',
    };

    it('should create in-app notification and send email', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.notificationPreference.findMany.mockResolvedValue([]);
      prisma.notification.create.mockResolvedValue({});

      await service.notify({
        ...baseParams,
        email: { to: 'test@example.com', subject: 'Order Created', html: '<p>Order</p>' },
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          type: 'ORDER_CREATED',
          title: 'Order Created',
          body: 'Your order has been created.',
          referenceId: 'order123',
        }),
      });
      expect(emailService.send).toHaveBeenCalledWith(
        'test@example.com',
        'Order Created',
        '<p>Order</p>',
      );
    });

    it('should skip duplicate notifications within 1 minute', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([]);
      prisma.notification.findFirst.mockResolvedValue({ id: 'existing' });

      await service.notify(baseParams);

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('should respect user preference to disable in-app notifications', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.notificationPreference.findMany.mockResolvedValue([
        { channel: 'IN_APP', enabled: false },
      ]);

      await service.notify(baseParams);

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should respect user preference to disable email notifications', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.notificationPreference.findMany.mockResolvedValue([
        { channel: 'EMAIL', enabled: false },
      ]);
      prisma.notification.create.mockResolvedValue({});

      await service.notify({
        ...baseParams,
        email: { to: 'test@example.com', subject: 'Test', html: '<p>Test</p>' },
      });

      expect(prisma.notification.create).toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('should skip idempotency check when no referenceId', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([]);
      prisma.notification.create.mockResolvedValue({});

      await service.notify({
        userId,
        type: 'ORDER_CREATED' as const,
        title: 'Test',
        body: 'Test body',
      });

      expect(prisma.notification.findFirst).not.toHaveBeenCalled();
      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should not send email when no email payload provided', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.notificationPreference.findMany.mockResolvedValue([]);
      prisma.notification.create.mockResolvedValue({});

      await service.notify(baseParams);

      expect(emailService.send).not.toHaveBeenCalled();
    });
  });

  describe('findUserNotifications', () => {
    it('should return paginated notifications', async () => {
      const notifications = [
        {
          id: notificationId,
          type: 'ORDER_CREATED',
          title: 'Order Created',
          body: 'Your order.',
          referenceId: 'order1',
          isRead: false,
          createdAt: new Date(),
        },
      ];
      prisma.notification.findMany.mockResolvedValue(notifications);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.findUserNotifications(userId, {
        page: 1,
        limit: 10,
        sortOrder: 'desc',
      });

      expect(result.data).toEqual(notifications);
      expect(result.meta.total).toBe(1);
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should apply isRead filter', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.findUserNotifications(userId, {
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isRead: false,
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, isRead: false },
        }),
      );
    });

    it('should apply type filter', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.findUserNotifications(userId, {
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        type: 'PAYMENT_SUCCEEDED',
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, type: 'PAYMENT_SUCCEEDED' },
        }),
      );
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread notification count', async () => {
      prisma.notification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount(userId);

      expect(result).toEqual({ count: 5 });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId, isRead: false },
      });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      prisma.notification.findUnique.mockResolvedValue({ id: notificationId, userId });
      const updated = {
        id: notificationId,
        type: 'ORDER_CREATED',
        title: 'Test',
        body: 'Test',
        referenceId: null,
        isRead: true,
        createdAt: new Date(),
      };
      prisma.notification.update.mockResolvedValue(updated);

      const result = await service.markAsRead(userId, notificationId);

      expect(result).toEqual(updated);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: notificationId },
        data: { isRead: true },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException when notification not found', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markAsRead(userId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when notification belongs to another user', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: notificationId,
        userId: 'other-user',
      });

      await expect(service.markAsRead(userId, notificationId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead(userId);

      expect(result).toEqual({ count: 3 });
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId, isRead: false },
        data: { isRead: true },
      });
    });

    it('should return zero when no unread notifications', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllAsRead(userId);

      expect(result).toEqual({ count: 0 });
    });
  });

  describe('getPreferences', () => {
    it('should return user notification preferences', async () => {
      const preferences = [
        { id: 'pref1', type: 'ORDER_CREATED', channel: 'EMAIL', enabled: false },
      ];
      prisma.notificationPreference.findMany.mockResolvedValue(preferences);

      const result = await service.getPreferences(userId);

      expect(result).toEqual(preferences);
      expect(prisma.notificationPreference.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: expect.any(Object),
        orderBy: { type: 'asc' },
      });
    });

    it('should return empty array when no preferences set', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([]);

      const result = await service.getPreferences(userId);

      expect(result).toEqual([]);
    });
  });

  describe('updatePreference', () => {
    it('should upsert notification preference', async () => {
      const preference = {
        id: 'pref1',
        type: 'ORDER_CREATED',
        channel: 'EMAIL',
        enabled: false,
      };
      prisma.notificationPreference.upsert.mockResolvedValue(preference);

      const result = await service.updatePreference(userId, {
        type: 'ORDER_CREATED',
        channel: 'EMAIL',
        enabled: false,
      });

      expect(result).toEqual(preference);
      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: {
          userId_type_channel: {
            userId,
            type: 'ORDER_CREATED',
            channel: 'EMAIL',
          },
        },
        create: {
          userId,
          type: 'ORDER_CREATED',
          channel: 'EMAIL',
          enabled: false,
        },
        update: { enabled: false },
        select: expect.any(Object),
      });
    });
  });

  describe('findAll', () => {
    it('should return all notifications without user filter', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 10, sortOrder: 'desc' });

      expect(result.data).toEqual([]);
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('should apply filters', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isRead: true,
        type: 'PAYMENT_FAILED',
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isRead: true, type: 'PAYMENT_FAILED' },
        }),
      );
    });
  });

  // ============================================
  // ADMIN METHODS
  // ============================================

  describe('adminMarkAsRead', () => {
    it('should mark any notification as read without ownership check', async () => {
      prisma.notification.findUnique.mockResolvedValue({ id: notificationId });
      const updated = {
        id: notificationId,
        userId,
        type: 'ORDER_CREATED',
        title: 'Test',
        body: 'Test',
        referenceId: null,
        isRead: true,
        createdAt: new Date(),
      };
      prisma.notification.update.mockResolvedValue(updated);

      const result = await service.adminMarkAsRead(notificationId);

      expect(result).toEqual(updated);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: notificationId },
        data: { isRead: true },
        select: expect.objectContaining({ userId: true }),
      });
    });

    it('should throw NotFoundException when notification not found', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.adminMarkAsRead('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('adminMarkAsUnread', () => {
    it('should mark any notification as unread without ownership check', async () => {
      prisma.notification.findUnique.mockResolvedValue({ id: notificationId });
      const updated = {
        id: notificationId,
        userId,
        type: 'ORDER_CREATED',
        title: 'Test',
        body: 'Test',
        referenceId: null,
        isRead: false,
        createdAt: new Date(),
      };
      prisma.notification.update.mockResolvedValue(updated);

      const result = await service.adminMarkAsUnread(notificationId);

      expect(result).toEqual(updated);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: notificationId },
        data: { isRead: false },
        select: expect.objectContaining({ userId: true }),
      });
    });

    it('should throw NotFoundException when notification not found', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.adminMarkAsUnread('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('adminDeleteOne', () => {
    it('should delete any notification without ownership check', async () => {
      prisma.notification.findUnique.mockResolvedValue({ id: notificationId });
      prisma.notification.delete.mockResolvedValue({});

      await service.adminDeleteOne(notificationId);

      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: { id: notificationId },
      });
    });

    it('should throw NotFoundException when notification not found', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.adminDeleteOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('adminDeleteAllRead', () => {
    it('should delete all read notifications across all users', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 10 });

      const result = await service.adminDeleteAllRead();

      expect(result).toEqual({ count: 10 });
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { isRead: true },
      });
    });

    it('should return zero when no read notifications exist', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.adminDeleteAllRead();

      expect(result).toEqual({ count: 0 });
    });
  });
});
