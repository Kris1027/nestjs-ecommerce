import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType, Role } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { EmailService } from '../email.service';
import { NotificationEvents, LowStockEvent } from '../events';
import { lowStockEmail } from '../email-templates';

@Injectable()
export class InventoryListener {
  private readonly logger = new Logger(InventoryListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  // Low stock alerts go to ALL admin users — not a single user
  @OnEvent(NotificationEvents.LOW_STOCK, { async: true })
  async handleLowStock(event: LowStockEvent): Promise<void> {
    try {
      // 1. Find all active admin users
      const admins = await this.prisma.user.findMany({
        where: { role: Role.ADMIN, isActive: true },
        select: { id: true, email: true },
      });

      if (admins.length === 0) {
        this.logger.warn('No active admins found for low stock alert');
        return;
      }

      // 2. Create in-app notification for each admin — allSettled so one failure doesn't block others
      await Promise.allSettled(
        admins.map((admin) =>
          this.notificationsService.notify({
            userId: admin.id,
            type: NotificationType.LOW_STOCK,
            title: 'Low stock alert',
            body: `${event.productName}: ${event.currentStock} units left (threshold: ${event.threshold}).`,
            referenceId: event.productId,
          }),
        ),
      );

      // 3. Send email to all admins at once
      const email = lowStockEmail(event.productName, event.currentStock, event.threshold);
      await this.emailService.sendToMany(
        admins.map((a) => a.email),
        email.subject,
        email.html,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to handle low_stock: ${msg}`);
    }
  }
}
