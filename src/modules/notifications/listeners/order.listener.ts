import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType, Role } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { EmailService } from '../email.service';
import {
  NotificationEvents,
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  RefundRequestCreatedEvent,
} from '../events';
import {
  orderCreatedEmail,
  orderShippedEmail,
  orderDeliveredEmail,
  orderCancelledEmail,
  refundRequestReceivedEmail,
  refundRequestAdminEmail,
} from '../email-templates';

@Injectable()
export class OrderListener {
  private readonly logger = new Logger(OrderListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  // Fired after checkout completes successfully
  @OnEvent(NotificationEvents.ORDER_CREATED, { async: true })
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      const email = orderCreatedEmail(event.userFirstName, event.orderNumber, event.total);

      await this.notificationsService.notify({
        userId: event.userId,
        type: NotificationType.ORDER_CREATED,
        title: 'Order placed',
        body: `Your order ${event.orderNumber} has been placed.`,
        referenceId: event.orderId,
        email: { to: event.userEmail, ...email },
      });
    } catch (error: unknown) {
      // Listeners must never crash — log and continue
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to handle order.created: ${msg}`);
    }
  }

  // Fired when admin updates order status
  // Only SHIPPED, DELIVERED, CANCELLED trigger customer notifications
  @OnEvent(NotificationEvents.ORDER_STATUS_CHANGED, { async: true })
  async handleOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    try {
      // Map status to notification type and email template
      const statusMap: Record<
        string,
        {
          type: NotificationType;
          title: string;
          body: string;
          email: { subject: string; html: string };
        } | null
      > = {
        SHIPPED: {
          type: NotificationType.ORDER_SHIPPED,
          title: 'Order shipped',
          body: `Your order ${event.orderNumber} is on its way!`,
          email: orderShippedEmail(event.userFirstName, event.orderNumber),
        },
        DELIVERED: {
          type: NotificationType.ORDER_DELIVERED,
          title: 'Order delivered',
          body: `Your order ${event.orderNumber} has been delivered.`,
          email: orderDeliveredEmail(event.userFirstName, event.orderNumber),
        },
        CANCELLED: {
          type: NotificationType.ORDER_CANCELLED,
          title: 'Order cancelled',
          body: `Your order ${event.orderNumber} has been cancelled.`,
          email: orderCancelledEmail(event.userFirstName, event.orderNumber),
        },
      };

      // CONFIRMED, PROCESSING — no notification (internal workflow steps)
      const config = statusMap[event.newStatus];
      if (!config) {
        return;
      }

      await this.notificationsService.notify({
        userId: event.userId,
        type: config.type,
        title: config.title,
        body: config.body,
        referenceId: event.orderId,
        email: { to: event.userEmail, ...config.email },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to handle order.status.changed: ${msg}`);
    }
  }

  // Fired when customer submits a refund request
  @OnEvent(NotificationEvents.REFUND_REQUEST_CREATED, { async: true })
  async handleRefundRequestCreated(event: RefundRequestCreatedEvent): Promise<void> {
    try {
      // 1. Notify the customer — confirmation that request was received
      const customerEmail = refundRequestReceivedEmail(event.userFirstName, event.orderNumber);

      await this.notificationsService.notify({
        userId: event.userId,
        type: NotificationType.REFUND_REQUEST_CREATED,
        title: 'Refund request received',
        body: `Your refund request for order ${event.orderNumber} has been submitted.`,
        referenceId: event.orderId,
        email: { to: event.userEmail, ...customerEmail },
      });

      // 2. Notify all admins — so they can review the request
      const admins = await this.prisma.user.findMany({
        where: { role: Role.ADMIN, isActive: true },
        select: { id: true, email: true },
      });

      if (admins.length === 0) {
        this.logger.warn('No active admins found for refund request notification');
        return;
      }

      // Create in-app notification for each admin — allSettled so one failure doesn't block others
      await Promise.allSettled(
        admins.map((admin) =>
          this.notificationsService.notify({
            userId: admin.id,
            type: NotificationType.REFUND_REQUEST_CREATED,
            title: 'New refund request',
            body: `Customer requested refund for order ${event.orderNumber}.`,
            referenceId: event.orderId,
          }),
        ),
      );

      // Send batch email to all admins
      const adminEmail = refundRequestAdminEmail(event.orderNumber, event.userEmail, event.reason);
      await this.emailService.sendToMany(
        admins.map((a) => a.email),
        adminEmail.subject,
        adminEmail.html,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to handle refund.request.created: ${msg}`);
    }
  }
}
