import { Test, type TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

function createMockNotificationsService(): Record<keyof NotificationsService, jest.Mock> {
  return {
    notify: jest.fn(),
    findUserNotifications: jest.fn(),
    getUnreadCount: jest.fn(),
    markAsRead: jest.fn(),
    markAsUnread: jest.fn(),
    markAllAsRead: jest.fn(),
    deleteOne: jest.fn(),
    deleteAllRead: jest.fn(),
    getPreferences: jest.fn(),
    updatePreference: jest.fn(),
    findAll: jest.fn(),
  };
}

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: ReturnType<typeof createMockNotificationsService>;

  const userId = 'user123';

  beforeEach(async () => {
    service = createMockNotificationsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: service }],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ============================================
  // CUSTOMER ENDPOINTS
  // ============================================

  describe('findUserNotifications', () => {
    it('should call notificationsService.findUserNotifications with userId and query', async () => {
      const query = { page: 1, limit: 10, sortOrder: 'desc' as const };
      const expected = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
      service.findUserNotifications.mockResolvedValue(expected);

      const result = await controller.findUserNotifications(userId, query as any);

      expect(service.findUserNotifications).toHaveBeenCalledWith(userId, query);
      expect(result).toEqual(expected);
    });
  });

  describe('getUnreadCount', () => {
    it('should call notificationsService.getUnreadCount with userId', async () => {
      const expected = { count: 5 };
      service.getUnreadCount.mockResolvedValue(expected);

      const result = await controller.getUnreadCount(userId);

      expect(service.getUnreadCount).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expected);
    });
  });

  describe('markAsRead', () => {
    it('should call notificationsService.markAsRead with userId and id', async () => {
      const notifId = 'notif1';
      const expected = { id: notifId, isRead: true };
      service.markAsRead.mockResolvedValue(expected);

      const result = await controller.markAsRead(userId, notifId);

      expect(service.markAsRead).toHaveBeenCalledWith(userId, notifId);
      expect(result).toEqual(expected);
    });
  });

  describe('markAsUnread', () => {
    it('should call notificationsService.markAsUnread with userId and id', async () => {
      const notifId = 'notif1';
      const expected = { id: notifId, isRead: false };
      service.markAsUnread.mockResolvedValue(expected);

      const result = await controller.markAsUnread(userId, notifId);

      expect(service.markAsUnread).toHaveBeenCalledWith(userId, notifId);
      expect(result).toEqual(expected);
    });
  });

  describe('markAllAsRead', () => {
    it('should call notificationsService.markAllAsRead with userId', async () => {
      const expected = { count: 3 };
      service.markAllAsRead.mockResolvedValue(expected);

      const result = await controller.markAllAsRead(userId);

      expect(service.markAllAsRead).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expected);
    });
  });

  describe('getPreferences', () => {
    it('should call notificationsService.getPreferences with userId', async () => {
      const expected = [{ type: 'ORDER_CREATED', channel: 'EMAIL', enabled: true }];
      service.getPreferences.mockResolvedValue(expected);

      const result = await controller.getPreferences(userId);

      expect(service.getPreferences).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expected);
    });
  });

  describe('updatePreference', () => {
    it('should call notificationsService.updatePreference with userId and DTO', async () => {
      const dto = { type: 'ORDER_CREATED', channel: 'EMAIL', enabled: false };
      const expected = { ...dto, id: 'pref1' };
      service.updatePreference.mockResolvedValue(expected);

      const result = await controller.updatePreference(userId, dto as any);

      expect(service.updatePreference).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expected);
    });
  });

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  describe('findAll', () => {
    it('should call notificationsService.findAll with query', async () => {
      const query = { page: 1, limit: 10, sortOrder: 'desc' as const };
      const expected = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
      service.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(query as any);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(expected);
    });
  });
});
