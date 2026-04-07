import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ReviewListener } from './review.listener';
import { NotificationsService } from '../notifications.service';
import { EmailService } from '../email.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReviewCreatedEvent } from '../events';
import { NotificationType } from '../../../generated/prisma/client';
import { createMockPrismaClient, resetMockPrismaClient } from '@test/mocks/prisma.mock';
import { createMockEmailService, createMockNotificationsService } from '@test/mocks/common.mock';

describe('ReviewListener', () => {
  let listener: ReviewListener;
  let notificationsService: ReturnType<typeof createMockNotificationsService>;
  let emailService: ReturnType<typeof createMockEmailService>;
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(async () => {
    notificationsService = createMockNotificationsService();
    emailService = createMockEmailService();
    prisma = createMockPrismaClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewListener,
        { provide: NotificationsService, useValue: notificationsService },
        { provide: EmailService, useValue: emailService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    listener = module.get<ReviewListener>(ReviewListener);
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetMockPrismaClient(prisma);
  });

  describe('handleReviewCreated', () => {
    const event = new ReviewCreatedEvent(
      'user1',
      'user@example.com',
      'John',
      'review1',
      'Wireless Headphones',
      5,
      'Great product',
    );

    it('should notify all admins and send batch email', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'admin1', email: 'admin1@example.com' },
        { id: 'admin2', email: 'admin2@example.com' },
      ]);

      await listener.handleReviewCreated(event);

      // In-app notification per admin
      expect(notificationsService.notify).toHaveBeenCalledTimes(2);
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin1',
          type: NotificationType.REVIEW_CREATED,
          referenceId: 'review1',
        }),
      );
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin2',
          type: NotificationType.REVIEW_CREATED,
        }),
      );
      // Batch email
      expect(emailService.sendToMany).toHaveBeenCalledWith(
        ['admin1@example.com', 'admin2@example.com'],
        expect.any(String),
        expect.any(String),
      );
    });

    it('should skip when no active admins found', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await listener.handleReviewCreated(event);

      expect(notificationsService.notify).not.toHaveBeenCalled();
      expect(emailService.sendToMany).not.toHaveBeenCalled();
    });

    it('should use fallback name when userFirstName is null', async () => {
      const anonymousEvent = new ReviewCreatedEvent(
        'user1',
        'user@example.com',
        null,
        'review1',
        'Wireless Headphones',
        3,
        'Okay product',
      );
      prisma.user.findMany.mockResolvedValue([{ id: 'admin1', email: 'admin1@example.com' }]);

      await listener.handleReviewCreated(anonymousEvent);

      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('A customer'),
        }),
      );
    });

    it('should catch and log errors without throwing', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      prisma.user.findMany.mockRejectedValue(new Error('DB down'));

      await expect(listener.handleReviewCreated(event)).resolves.toBeUndefined();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to handle review.created'),
      );
    });
  });
});
