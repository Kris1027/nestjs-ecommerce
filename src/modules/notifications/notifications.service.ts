import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, NotificationType, NotificationChannel } from '../../generated/prisma/client';
import {
  getPrismaPageArgs,
  paginate,
  type PaginatedResult,
} from '../../common/utils/pagination.util';
import { EmailService } from './email.service';
import type { NotificationQueryDto, UpdatePreferenceDto } from './dto';

// ============================================
// SELECT OBJECT & TYPE
// ============================================

// Define exactly which fields to return — never expose raw DB rows
const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  referenceId: true,
  isRead: true,
  createdAt: true,
} as const;

// Admin view includes userId so dashboard can identify notification owners
const adminNotificationSelect = {
  ...notificationSelect,
  userId: true,
} as const;

// Auto-generate TypeScript type from Prisma select — stays in sync with DB
type NotificationResponse = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

type AdminNotificationResponse = Prisma.NotificationGetPayload<{
  select: typeof adminNotificationSelect;
}>;

// Preference shape returned to clients
const preferenceSelect = {
  id: true,
  type: true,
  channel: true,
  enabled: true,
} as const;

type PreferenceResponse = Prisma.NotificationPreferenceGetPayload<{
  select: typeof preferenceSelect;
}>;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // ============================================
  // CORE NOTIFICATION METHOD (called by listeners)
  // ============================================

  // Create in-app notification + optionally send email
  // This is the single entry point all event listeners use
  async notify(params: {
    userId: string; // Who receives the notification
    type: NotificationType; // Which notification type (maps to enum)
    title: string; // Short title for in-app display
    body: string; // Longer description
    referenceId?: string; // Polymorphic link (orderId, paymentId, etc.)
    email?: { to: string; subject: string; html: string }; // Optional email payload
  }): Promise<void> {
    const { userId, type, referenceId, title, body, email } = params;

    // 1. Best-effort idempotency check — prevent duplicate notifications for same event
    // Same type + referenceId within 1 minute = duplicate (covers both in-app and email)
    // Note: not fully race-proof without a DB-level unique constraint, but sufficient
    // for notification dedup where a rare duplicate is acceptable
    if (referenceId) {
      const oneMinuteAgo = new Date(Date.now() - 60_000);
      const existing = await this.prisma.notification.findFirst({
        where: {
          type,
          referenceId,
          createdAt: { gte: oneMinuteAgo },
        },
        select: { id: true },
      });

      if (existing) {
        this.logger.debug(`Duplicate notification skipped: ${type} for ${referenceId}`);
        return;
      }
    }

    // 2. Check user preferences — opt-out model (no record = enabled)
    const preferences = await this.prisma.notificationPreference.findMany({
      where: { userId, type },
      select: { channel: true, enabled: true },
    });

    // Convert to a lookup map for quick channel checks
    const prefMap = new Map(preferences.map((p) => [p.channel, p.enabled]));

    // Default to true (opt-out model) — only disabled if explicitly set to false
    const inAppEnabled = prefMap.get(NotificationChannel.IN_APP) ?? true;
    const emailEnabled = prefMap.get(NotificationChannel.EMAIL) ?? true;

    // 3. Create in-app notification if enabled
    if (inAppEnabled) {
      await this.prisma.notification.create({
        data: { userId, type, title, body, referenceId },
      });
    }

    // 4. Send email if enabled and email payload provided
    if (emailEnabled && email) {
      await this.emailService.send(email.to, email.subject, email.html);
    }
  }

  // ============================================
  // CUSTOMER METHODS
  // ============================================

  // List notifications for a user (paginated, filterable by isRead and type)
  async findUserNotifications(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<PaginatedResult<NotificationResponse>> {
    const { skip, take } = getPrismaPageArgs(query);

    // Build dynamic where clause from query filters
    const where: Prisma.NotificationWhereInput = { userId };

    // Filter by read/unread status
    if (query.isRead !== undefined) {
      where.isRead = query.isRead;
    }

    // Filter by notification type
    if (query.type) {
      where.type = query.type as NotificationType;
    }

    // Run count and data fetch in parallel for performance
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: notificationSelect,
        orderBy: { createdAt: 'desc' }, // Newest first
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return paginate(notifications, total, query);
  }

  // Get unread count for UI badge
  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    return { count };
  }

  // Mark a single notification as read (ownership enforced)
  async markAsRead(userId: string, notificationId: string): Promise<NotificationResponse> {
    // Find notification and verify ownership in one query
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, userId: true },
    });

    // Return 404 for both "not found" and "belongs to other user" — no info leak
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
      select: notificationSelect,
    });
  }

  // Mark a single notification as unread (ownership enforced)
  async markAsUnread(userId: string, notificationId: string): Promise<NotificationResponse> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, userId: true },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: false },
      select: notificationSelect,
    });
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { count: result.count };
  }

  // Delete a single notification (ownership enforced)
  async deleteOne(userId: string, notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, userId: true },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }

  // Delete all read notifications for a user
  async deleteAllRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.deleteMany({
      where: { userId, isRead: true },
    });

    return { count: result.count };
  }

  // Get user's notification preferences
  async getPreferences(userId: string): Promise<PreferenceResponse[]> {
    // Returns only explicitly set preferences — missing ones default to enabled
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      select: preferenceSelect,
      orderBy: { type: 'asc' },
    });
  }

  // Update a single preference (upsert — creates if doesn't exist)
  async updatePreference(userId: string, dto: UpdatePreferenceDto): Promise<PreferenceResponse> {
    // Upsert: create if no record exists, update if it does
    // This is the opt-out model in action — first disable creates the record
    return this.prisma.notificationPreference.upsert({
      where: {
        // Uses the @@unique([userId, type, channel]) compound key
        userId_type_channel: {
          userId,
          type: dto.type as NotificationType,
          channel: dto.channel as NotificationChannel,
        },
      },
      create: {
        userId,
        type: dto.type as NotificationType,
        channel: dto.channel as NotificationChannel,
        enabled: dto.enabled,
      },
      update: {
        enabled: dto.enabled,
      },
      select: preferenceSelect,
    });
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  // List all notifications across all users (admin dashboard)
  async findAll(query: NotificationQueryDto): Promise<PaginatedResult<AdminNotificationResponse>> {
    const { skip, take } = getPrismaPageArgs(query);

    // Build dynamic where clause — same filters as customer but no userId restriction
    const where: Prisma.NotificationWhereInput = {};

    if (query.isRead !== undefined) {
      where.isRead = query.isRead;
    }

    if (query.type) {
      where.type = query.type as NotificationType;
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: adminNotificationSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return paginate(notifications, total, query);
  }

  // Admin mark any notification as read (no ownership check)
  // Single query — catches P2025 if record doesn't exist
  async adminMarkAsRead(notificationId: string): Promise<AdminNotificationResponse> {
    try {
      return await this.prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
        select: adminNotificationSelect,
      });
    } catch (error) {
      if (this.isPrismaNotFound(error)) {
        throw new NotFoundException('Notification not found');
      }
      throw error;
    }
  }

  // Admin mark any notification as unread (no ownership check)
  async adminMarkAsUnread(notificationId: string): Promise<AdminNotificationResponse> {
    try {
      return await this.prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: false },
        select: adminNotificationSelect,
      });
    } catch (error) {
      if (this.isPrismaNotFound(error)) {
        throw new NotFoundException('Notification not found');
      }
      throw error;
    }
  }

  // Admin delete any notification (no ownership check)
  async adminDeleteOne(notificationId: string): Promise<void> {
    try {
      await this.prisma.notification.delete({
        where: { id: notificationId },
      });
    } catch (error) {
      if (this.isPrismaNotFound(error)) {
        throw new NotFoundException('Notification not found');
      }
      throw error;
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private isPrismaNotFound(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
  }

  // Admin delete all read notifications across all users
  async adminDeleteAllRead(): Promise<{ count: number }> {
    const result = await this.prisma.notification.deleteMany({
      where: { isRead: true },
    });

    return { count: result.count };
  }
}
