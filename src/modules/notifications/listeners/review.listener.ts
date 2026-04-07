import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType, Role } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { EmailService } from '../email.service';
import { NotificationEvents, ReviewCreatedEvent } from '../events';
import { reviewCreatedAdminEmail } from '../email-templates';

@Injectable()
export class ReviewListener {
  private readonly logger = new Logger(ReviewListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  // New review submitted — notify all admins for moderation
  @OnEvent(NotificationEvents.REVIEW_CREATED, { async: true })
  async handleReviewCreated(event: ReviewCreatedEvent): Promise<void> {
    try {
      // 1. Find all active admin users
      const admins = await this.prisma.user.findMany({
        where: { role: Role.ADMIN, isActive: true },
        select: { id: true, email: true },
      });

      if (admins.length === 0) {
        this.logger.warn('No active admins found for review notification');
        return;
      }

      const reviewerName = event.userFirstName ?? 'A customer';

      // 2. Create in-app notification for each admin (concurrent for performance)
      // 2. Create in-app notification for each admin — allSettled so one failure doesn't block others
      await Promise.allSettled(
        admins.map((admin) =>
          this.notificationsService.notify({
            userId: admin.id,
            type: NotificationType.REVIEW_CREATED,
            title: 'New review pending',
            body: `${reviewerName} left a ${event.rating}-star review on ${event.productName}.`,
            referenceId: event.reviewId,
          }),
        ),
      );

      // 3. Send batch email to all admins
      const email = reviewCreatedAdminEmail(
        reviewerName,
        event.productName,
        event.rating,
        event.title,
      );
      await this.emailService.sendToMany(
        admins.map((a) => a.email),
        email.subject,
        email.html,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to handle review.created: ${msg}`);
    }
  }
}
