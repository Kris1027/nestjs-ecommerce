import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentStatus, Prisma } from '../../generated/prisma/client';
import {
  getPrismaPageArgs,
  paginate,
  type PaginatedResult,
} from '../../common/utils/pagination.util';
import { OrdersService } from '../orders/orders.service';
import type { Env } from '../../config/env.validation';
import { STRIPE } from './payments.provider';
import type { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import type { RefundDto } from './dto/refund.dto';
import type { PaymentQuery } from './dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotificationEvents,
  PaymentSucceededEvent,
  PaymentFailedEvent,
  RefundCompletedEvent,
  RefundFailedEvent,
} from '../notifications/events';

// ============================================
// SELECT OBJECTS & TYPES
// ============================================

// Fields returned for a single payment
const paymentSelect = {
  id: true,
  orderId: true,
  stripePaymentIntentId: true,
  status: true,
  amount: true,
  currency: true,
  refundedAmount: true,
  stripeRefundId: true,
  refundReason: true,
  failureCode: true,
  failureMessage: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Payment with related order info (for list/detail views)
const paymentWithOrderSelect = {
  ...paymentSelect,
  order: {
    select: {
      orderNumber: true,
      status: true,
    },
  },
} as const;

type PaymentPayload = Prisma.PaymentGetPayload<{
  select: typeof paymentSelect;
}>;
type PaymentWithOrderPayload = Prisma.PaymentGetPayload<{
  select: typeof paymentWithOrderSelect;
}>;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE) private readonly stripe: Stripe,
    private readonly ordersService: OrdersService,
    private readonly eventEmitter: EventEmitter2,
    configService: ConfigService<Env, true>,
  ) {
    // Read webhook secret once at startup — never changes at runtime
    this.webhookSecret = configService.get('STRIPE_WEBHOOK_SECRET');
  }

  // ============================================
  // CUSTOMER METHODS
  // ============================================

  async createPaymentIntent(
    userId: string,
    dto: CreatePaymentIntentDto,
  ): Promise<{ clientSecret: string | null }> {
    // 1. Find order with ownership check
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        orderNumber: true,
        total: true,
        payment: {
          select: {
            id: true,
            status: true,
            stripePaymentIntentId: true,
          },
        },
      },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'PENDING') {
      throw new BadRequestException('Order is not awaiting payment');
    }

    // 2. Handle existing payment record (idempotent retry or rejection)
    if (order.payment) {
      // PENDING or FAILED: the Stripe intent might still be usable
      if (
        order.payment.status === PaymentStatus.PENDING ||
        order.payment.status === PaymentStatus.FAILED
      ) {
        const existingIntent = await this.withRetry(() =>
          this.stripe.paymentIntents.retrieve(order.payment!.stripePaymentIntentId),
        );

        // If Stripe has canceled the intent, delete our record and create fresh
        if (existingIntent.status === 'canceled') {
          await this.prisma.payment.delete({
            where: { id: order.payment.id },
          });
          // Fall through to create new intent below
        } else {
          // Intent is still alive — return it (customer can retry payment)
          return { clientSecret: existingIntent.client_secret };
        }
      } else {
        // SUCCEEDED, REFUND_PENDING, REFUNDED, PARTIALLY_REFUNDED
        throw new BadRequestException('Payment already completed for this order');
      }
    }

    // 3. Convert PLN to groszy (Stripe uses smallest currency unit)
    // e.g., 99.99 PLN → 9999 groszy
    const amount = Math.round(Number(order.total) * 100);

    // 4. Create Stripe PaymentIntent with idempotency key
    // Idempotency key prevents duplicate charges if this endpoint is called twice
    const paymentIntent = await this.withRetry(() =>
      this.stripe.paymentIntents.create(
        {
          amount,
          currency: 'pln',
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
          },
        },
        { idempotencyKey: `pi_${order.id}` },
      ),
    );

    // 5. Save Payment record in our database
    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        stripePaymentIntentId: paymentIntent.id,
        amount: Number(order.total),
        currency: 'pln',
      },
    });

    this.logger.log(
      `Created payment intent ${paymentIntent.id} for order ${order.orderNumber} (${amount} groszy)`,
    );

    return { clientSecret: paymentIntent.client_secret };
  }

  async getPaymentByOrderId(orderId: string, userId?: string): Promise<PaymentWithOrderPayload> {
    // Build where clause — filter by order ownership if userId provided
    const where: Prisma.PaymentWhereInput = { orderId };
    if (userId) {
      where.order = { userId };
    }

    const payment = await this.prisma.payment.findFirst({
      where,
      select: paymentWithOrderSelect,
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  // ============================================
  // WEBHOOK HANDLING
  // ============================================

  async handleWebhook(rawBody: Buffer, signature: string): Promise<{ received: true }> {
    // 1. Verify webhook signature — rejects forged requests
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }

    // 2. Deduplicate — Stripe delivers duplicates 5-10% of the time
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { id: event.id },
    });

    if (existing) {
      this.logger.log(`Webhook event ${event.id} already processed, skipping`);
      return { received: true };
    }

    // 3. Dispatch to the appropriate handler based on event type
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSuccess(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentFailure(event.data.object);
        break;

      case 'payment_intent.canceled':
        await this.handlePaymentCanceled(event.data.object);
        break;

      case 'charge.refund.updated':
        await this.handleRefundUpdate(event.data.object);
        break;

      default:
        this.logger.log(`Unhandled webhook event type: ${event.type}`);
    }

    // 4. Record event as processed AFTER successful handling
    // If handler threw, we don't record — Stripe will retry delivery
    await this.prisma.webhookEvent.create({
      data: { id: event.id, type: event.type },
    });

    return { received: true };
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (!payment) {
      this.logger.warn(`No payment found for intent ${paymentIntent.id}`);
      return;
    }

    // Guard against out-of-order or duplicate events
    // Only transition from PENDING or FAILED (retry after decline)
    if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.FAILED) {
      this.logger.warn(`Payment ${payment.id} in ${payment.status}, ignoring succeeded event`);
      return;
    }

    // Update payment status to SUCCEEDED
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.SUCCEEDED },
    });

    const order = await this.prisma.order.findUnique({
      where: { id: payment.orderId },
      select: {
        orderNumber: true,
        userId: true,
        user: { select: { email: true, firstName: true } },
      },
    });

    if (order) {
      this.eventEmitter.emit(
        NotificationEvents.PAYMENT_SUCCEEDED,
        new PaymentSucceededEvent(
          order.userId,
          order.user.email,
          order.user.firstName,
          payment.orderId,
          order.orderNumber,
          String(payment.amount),
        ),
      );
    }

    // Confirm the order — triggers stock reservation → sale conversion
    await this.ordersService.updateOrderStatus(payment.orderId, {
      status: 'CONFIRMED',
    });

    this.logger.log(`Payment ${payment.id} succeeded, order ${payment.orderId} confirmed`);
  }

  private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (!payment) {
      this.logger.warn(`No payment found for intent ${paymentIntent.id}`);
      return;
    }

    // Only update if still PENDING — guard against stale events
    if (payment.status !== PaymentStatus.PENDING) {
      this.logger.warn(`Payment ${payment.id} in ${payment.status}, ignoring failed event`);
      return;
    }

    // Extract failure details from Stripe for debugging
    const lastError = paymentIntent.last_payment_error;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        failureCode: lastError?.code ?? null,
        failureMessage: lastError?.message ?? null,
      },
    });

    // Fetch user + order for notification
    const order = await this.prisma.order.findUnique({
      where: { id: payment.orderId },
      select: {
        orderNumber: true,
        userId: true,
        user: { select: { email: true, firstName: true } },
      },
    });

    if (order) {
      this.eventEmitter.emit(
        NotificationEvents.PAYMENT_FAILED,
        new PaymentFailedEvent(
          order.userId,
          order.user.email,
          order.user.firstName,
          payment.orderId,
          order.orderNumber,
        ),
      );
    }

    this.logger.warn(
      `Payment ${payment.id} failed: ${lastError?.code ?? 'unknown'} - ${lastError?.message ?? 'no details'}`,
    );
  }

  private async handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (!payment) {
      this.logger.warn(`No payment found for intent ${paymentIntent.id}`);
      return;
    }

    if (payment.status !== PaymentStatus.PENDING) {
      this.logger.warn(`Payment ${payment.id} in ${payment.status}, ignoring canceled event`);
      return;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        failureCode: 'canceled',
        failureMessage: 'Payment intent was canceled',
      },
    });

    this.logger.log(`Payment ${payment.id} canceled`);
  }

  private async handleRefundUpdate(refund: Stripe.Refund): Promise<void> {
    // Extract PaymentIntent ID (can be string or expanded object)
    const paymentIntentId =
      typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id;

    if (!paymentIntentId) {
      this.logger.warn(`Refund ${refund.id} has no payment_intent, skipping`);
      return;
    }

    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!payment) {
      this.logger.warn(`No payment found for refund intent ${paymentIntentId}`);
      return;
    }

    if (refund.status === 'succeeded') {
      // Convert groszy back to PLN and accumulate
      const refundedAmount = refund.amount / 100;
      const totalRefunded = Number(payment.refundedAmount) + refundedAmount;
      const isFullRefund = totalRefunded >= Number(payment.amount);

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
          refundedAmount: totalRefunded,
        },
      });

      this.logger.log(
        `Refund ${refund.id} succeeded: ${refundedAmount} PLN (total: ${totalRefunded} PLN)`,
      );

      // Notify user about successful refund
      const order = await this.prisma.order.findUnique({
        where: { id: payment.orderId },
        select: {
          orderNumber: true,
          userId: true,
          user: { select: { email: true, firstName: true } },
        },
      });

      if (order) {
        this.eventEmitter.emit(
          NotificationEvents.REFUND_COMPLETED,
          new RefundCompletedEvent(
            order.userId,
            order.user.email,
            order.user.firstName,
            payment.orderId,
            order.orderNumber,
            String(refundedAmount),
          ),
        );
      }
    } else if (refund.status === 'failed') {
      // Revert from REFUND_PENDING back to SUCCEEDED — manual resolution needed
      if (payment.status === PaymentStatus.REFUND_PENDING) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.SUCCEEDED },
        });

        this.logger.error(
          `Refund ${refund.id} failed for payment ${payment.id}. Reverted to SUCCEEDED. Manual resolution needed.`,
        );
      }

      // Notify user about failed refund
      const failedOrder = await this.prisma.order.findUnique({
        where: { id: payment.orderId },
        select: {
          orderNumber: true,
          userId: true,
          user: { select: { email: true, firstName: true } },
        },
      });

      if (failedOrder) {
        this.eventEmitter.emit(
          NotificationEvents.REFUND_FAILED,
          new RefundFailedEvent(
            failedOrder.userId,
            failedOrder.user.email,
            failedOrder.user.firstName,
            payment.orderId,
            failedOrder.orderNumber,
          ),
        );
      }
    }
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async getAllPayments(query: PaymentQuery): Promise<PaginatedResult<PaymentWithOrderPayload>> {
    const { skip, take } = getPrismaPageArgs(query);

    const where: Prisma.PaymentWhereInput = {};

    if (query.status) {
      where.status = query.status as PaymentStatus;
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: paymentWithOrderSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return paginate(payments, total, query);
  }

  async refund(paymentId: string, dto: RefundDto): Promise<PaymentPayload> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: paymentSelect,
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Can only refund payments that succeeded (or were partially refunded)
    if (
      payment.status !== PaymentStatus.SUCCEEDED &&
      payment.status !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new BadRequestException(`Cannot refund payment with status "${payment.status}"`);
    }

    // Calculate how much can still be refunded
    const refundableAmount = Number(payment.amount) - Number(payment.refundedAmount);
    const refundAmount = dto.amount ?? refundableAmount; // No amount = full refund

    if (refundAmount <= 0 || refundAmount > refundableAmount) {
      throw new BadRequestException(
        `Refund amount must be between 0.01 and ${refundableAmount.toFixed(2)} PLN`,
      );
    }

    // Convert PLN to groszy for Stripe
    const stripeAmount = Math.round(refundAmount * 100);

    // Create refund on Stripe — async in live mode (webhook confirms completion)
    const stripeRefund = await this.withRetry(() =>
      this.stripe.refunds.create(
        {
          payment_intent: payment.stripePaymentIntentId,
          amount: stripeAmount,
          reason: 'requested_by_customer',
          metadata: { reason: dto.reason ?? 'Admin refund' },
        },
        { idempotencyKey: randomUUID() },
      ),
    );

    // Set REFUND_PENDING — NOT REFUNDED. Actual confirmation comes via webhook.
    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.REFUND_PENDING,
        stripeRefundId: stripeRefund.id,
        refundReason: dto.reason,
      },
      select: paymentSelect,
    });

    this.logger.log(
      `Refund initiated for payment ${paymentId}: ${refundAmount} PLN (${stripeRefund.id})`,
    );

    return updated;
  }

  async expireAbandonedPayments(): Promise<{ expired: number }> {
    // Find PENDING payments older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const abandonedPayments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING,
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        stripePaymentIntentId: true,
        orderId: true,
        order: { select: { status: true } },
      },
    });

    let expired = 0;

    for (const payment of abandonedPayments) {
      try {
        // Cancel the Stripe PaymentIntent
        await this.withRetry(() =>
          this.stripe.paymentIntents.cancel(payment.stripePaymentIntentId),
        );

        // Mark payment as failed
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
            failureCode: 'expired',
            failureMessage: 'Payment intent expired after 24 hours',
          },
        });

        // Cancel the order (releases reserved stock via OrdersService)
        if (payment.order.status === 'PENDING') {
          await this.ordersService.updateOrderStatus(payment.orderId, {
            status: 'CANCELLED',
            adminNotes: 'Auto-cancelled: payment expired after 24 hours',
          });
        }

        expired++;
      } catch (error) {
        // Log and continue — don't let one failure block others
        this.logger.error(
          `Failed to expire payment ${payment.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    this.logger.log(`Expired ${expired}/${abandonedPayments.length} abandoned payments`);
    return { expired };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  // Retry wrapper for transient Stripe failures (429 rate limits, 5xx server errors)
  // 4xx errors (invalid params, auth) fail immediately — no point retrying
  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        // Only retry on network/rate/server errors
        const isRetryable =
          error instanceof Stripe.errors.StripeConnectionError ||
          error instanceof Stripe.errors.StripeAPIError ||
          error instanceof Stripe.errors.StripeRateLimitError;

        if (attempt === maxRetries || !isRetryable) {
          throw error;
        }

        // Exponential backoff: 2s, 4s, 8s + random jitter (0-500ms)
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        this.logger.warn(
          `Stripe API attempt ${attempt}/${maxRetries} failed, retrying in ${Math.round(delay)}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // TypeScript requires this — the loop always returns or throws
    throw new Error('Retry loop exhausted');
  }
}
