import { Test, type TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { createMockPrismaClient, resetMockPrismaClient } from '@test/mocks/prisma.mock';
import {
  createMockConfigService,
  createMockStripeClient,
  createMockEventEmitter,
} from '@test/mocks/common.mock';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { STRIPE } from './payments.provider';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { NotificationEvents } from '../notifications/events';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let stripe: ReturnType<typeof createMockStripeClient>;
  let ordersService: { updateOrderStatus: jest.Mock };
  let eventEmitter: ReturnType<typeof createMockEventEmitter>;

  beforeEach(async () => {
    prisma = createMockPrismaClient();
    stripe = createMockStripeClient();
    ordersService = { updateOrderStatus: jest.fn() };
    eventEmitter = createMockEventEmitter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: STRIPE, useValue: stripe },
        { provide: OrdersService, useValue: ordersService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: ConfigService, useValue: createMockConfigService() },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetMockPrismaClient(prisma);
  });

  const userId = 'cluser123456789012345678';
  const orderId = 'clorder12345678901234567';
  const paymentId = 'clpay1234567890123456789';
  const stripeIntentId = 'pi_test_123';

  const mockOrder = {
    id: orderId,
    userId,
    status: 'PENDING',
    orderNumber: 'ORD-20260208-AB12',
    total: 75.48,
    payment: null,
  };

  const mockPayment = {
    id: paymentId,
    orderId,
    stripePaymentIntentId: stripeIntentId,
    status: 'PENDING',
    amount: 75.48,
    currency: 'pln',
    refundedAmount: 0,
    stripeRefundId: null,
    refundReason: null,
    failureCode: null,
    failureMessage: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent for pending order', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.payment.create.mockResolvedValue(mockPayment);

      const result = await service.createPaymentIntent(userId, { orderId });

      expect(result).toEqual({ clientSecret: 'pi_test_123_secret_456' });
      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 7548, // 75.48 PLN in groszy
          currency: 'pln',
          metadata: { orderId, orderNumber: 'ORD-20260208-AB12' },
        }),
        { idempotencyKey: `pi_${orderId}` },
      );
      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId,
          stripePaymentIntentId: 'pi_test_123',
          amount: 75.48,
          currency: 'pln',
        }),
      });
    });

    it('should throw NotFoundException when order not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.createPaymentIntent(userId, { orderId })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when order belongs to another user', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...mockOrder, userId: 'other-user' });

      await expect(service.createPaymentIntent(userId, { orderId })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when order is not pending', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...mockOrder, status: 'CONFIRMED' });

      await expect(service.createPaymentIntent(userId, { orderId })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return existing intent when payment is pending', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        payment: {
          id: paymentId,
          status: 'PENDING',
          stripePaymentIntentId: stripeIntentId,
        },
      });
      stripe.paymentIntents.retrieve.mockResolvedValue({
        id: stripeIntentId,
        status: 'requires_payment_method',
        client_secret: 'existing_secret',
      });

      const result = await service.createPaymentIntent(userId, { orderId });

      expect(result).toEqual({ clientSecret: 'existing_secret' });
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('should recreate intent when existing one was canceled by Stripe', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        payment: {
          id: paymentId,
          status: 'PENDING',
          stripePaymentIntentId: stripeIntentId,
        },
      });
      stripe.paymentIntents.retrieve.mockResolvedValue({
        id: stripeIntentId,
        status: 'canceled',
      });
      prisma.payment.delete.mockResolvedValue({});
      prisma.payment.create.mockResolvedValue(mockPayment);

      const result = await service.createPaymentIntent(userId, { orderId });

      expect(prisma.payment.delete).toHaveBeenCalledWith({
        where: { id: paymentId },
      });
      expect(result).toEqual({ clientSecret: 'pi_test_123_secret_456' });
    });

    it('should throw BadRequestException when payment already completed', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        payment: {
          id: paymentId,
          status: 'SUCCEEDED',
          stripePaymentIntentId: stripeIntentId,
        },
      });

      await expect(service.createPaymentIntent(userId, { orderId })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getPaymentByOrderId', () => {
    it('should return payment with order info', async () => {
      const paymentWithOrder = {
        ...mockPayment,
        order: { orderNumber: 'ORD-20260208-AB12', status: 'PENDING' },
      };
      prisma.payment.findFirst.mockResolvedValue(paymentWithOrder);

      const result = await service.getPaymentByOrderId(orderId);

      expect(result).toEqual(paymentWithOrder);
    });

    it('should filter by userId when provided', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.getPaymentByOrderId(orderId, userId)).rejects.toThrow(NotFoundException);

      expect(prisma.payment.findFirst).toHaveBeenCalledWith({
        where: { orderId, order: { userId } },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException when payment not found', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.getPaymentByOrderId('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleWebhook', () => {
    const rawBody = Buffer.from('test');
    const signature = 'test_signature';

    it('should throw BadRequestException on invalid signature', async () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(BadRequestException);
    });

    it('should skip already processed events', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: { id: stripeIntentId } },
      });
      prisma.webhookEvent.findUnique.mockResolvedValue({ id: 'evt_123' });

      const result = await service.handleWebhook(rawBody, signature);

      expect(result).toEqual({ received: true });
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it('should handle payment_intent.succeeded', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_success',
        type: 'payment_intent.succeeded',
        data: { object: { id: stripeIntentId } },
      });
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.payment.findUnique.mockResolvedValue(mockPayment);
      prisma.payment.update.mockResolvedValue({});
      prisma.order.findUnique.mockResolvedValue({
        orderNumber: 'ORD-20260208-AB12',
        userId,
        user: { email: 'test@example.com', firstName: 'John' },
      });
      ordersService.updateOrderStatus.mockResolvedValue({});
      prisma.webhookEvent.create.mockResolvedValue({});

      const result = await service.handleWebhook(rawBody, signature);

      expect(result).toEqual({ received: true });
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: { status: 'SUCCEEDED' },
      });
      expect(ordersService.updateOrderStatus).toHaveBeenCalledWith(orderId, {
        status: 'CONFIRMED',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NotificationEvents.PAYMENT_SUCCEEDED,
        expect.objectContaining({ userId }),
      );
    });

    it('should handle payment_intent.payment_failed', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_failed',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: stripeIntentId,
            last_payment_error: { code: 'card_declined', message: 'Card was declined' },
          },
        },
      });
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.payment.findUnique.mockResolvedValue(mockPayment);
      prisma.payment.update.mockResolvedValue({});
      prisma.order.findUnique.mockResolvedValue({
        orderNumber: 'ORD-20260208-AB12',
        userId,
        user: { email: 'test@example.com', firstName: 'John' },
      });
      prisma.webhookEvent.create.mockResolvedValue({});

      await service.handleWebhook(rawBody, signature);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: {
          status: 'FAILED',
          failureCode: 'card_declined',
          failureMessage: 'Card was declined',
        },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NotificationEvents.PAYMENT_FAILED,
        expect.objectContaining({ userId }),
      );
    });

    it('should handle payment_intent.canceled', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_canceled',
        type: 'payment_intent.canceled',
        data: { object: { id: stripeIntentId } },
      });
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.payment.findUnique.mockResolvedValue(mockPayment);
      prisma.payment.update.mockResolvedValue({});
      prisma.webhookEvent.create.mockResolvedValue({});

      await service.handleWebhook(rawBody, signature);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: {
          status: 'FAILED',
          failureCode: 'canceled',
          failureMessage: 'Payment intent was canceled',
        },
      });
    });

    it('should handle charge.refund.updated with succeeded status', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_refund',
        type: 'charge.refund.updated',
        data: {
          object: {
            id: 're_test',
            status: 'succeeded',
            amount: 5000, // 50.00 PLN in groszy
            payment_intent: stripeIntentId,
          },
        },
      });
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: 'REFUND_PENDING',
        amount: 75.48,
        refundedAmount: 0,
      });
      prisma.payment.update.mockResolvedValue({});
      prisma.order.findUnique.mockResolvedValue({
        orderNumber: 'ORD-20260208-AB12',
        userId,
        user: { email: 'test@example.com', firstName: 'John' },
      });
      prisma.webhookEvent.create.mockResolvedValue({});

      await service.handleWebhook(rawBody, signature);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: {
          status: 'PARTIALLY_REFUNDED',
          refundedAmount: 50,
        },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NotificationEvents.REFUND_COMPLETED,
        expect.objectContaining({ userId }),
      );
    });

    it('should set REFUNDED status when full amount is refunded', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_full_refund',
        type: 'charge.refund.updated',
        data: {
          object: {
            id: 're_full',
            status: 'succeeded',
            amount: 7548, // Full 75.48 PLN
            payment_intent: stripeIntentId,
          },
        },
      });
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: 'REFUND_PENDING',
        amount: 75.48,
        refundedAmount: 0,
      });
      prisma.payment.update.mockResolvedValue({});
      prisma.order.findUnique.mockResolvedValue({
        orderNumber: 'ORD-20260208-AB12',
        userId,
        user: { email: 'test@example.com', firstName: 'John' },
      });
      prisma.webhookEvent.create.mockResolvedValue({});

      await service.handleWebhook(rawBody, signature);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: {
          status: 'REFUNDED',
          refundedAmount: 75.48,
        },
      });
    });

    it('should handle failed refund and revert to SUCCEEDED', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_refund_fail',
        type: 'charge.refund.updated',
        data: {
          object: {
            id: 're_failed',
            status: 'failed',
            amount: 5000,
            payment_intent: stripeIntentId,
          },
        },
      });
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: 'REFUND_PENDING',
      });
      prisma.payment.update.mockResolvedValue({});
      prisma.order.findUnique.mockResolvedValue({
        orderNumber: 'ORD-20260208-AB12',
        userId,
        user: { email: 'test@example.com', firstName: 'John' },
      });
      prisma.webhookEvent.create.mockResolvedValue({});

      await service.handleWebhook(rawBody, signature);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: { status: 'SUCCEEDED' },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NotificationEvents.REFUND_FAILED,
        expect.objectContaining({ userId }),
      );
    });

    it('should ignore succeeded event when payment not in PENDING/FAILED state', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_stale',
        type: 'payment_intent.succeeded',
        data: { object: { id: stripeIntentId } },
      });
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: 'SUCCEEDED',
      });
      prisma.webhookEvent.create.mockResolvedValue({});

      await service.handleWebhook(rawBody, signature);

      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('should handle unrecognized event type gracefully', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_unknown',
        type: 'some.unknown.event',
        data: { object: {} },
      });
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.webhookEvent.create.mockResolvedValue({});

      const result = await service.handleWebhook(rawBody, signature);

      expect(result).toEqual({ received: true });
    });
  });

  describe('getAllPayments', () => {
    it('should return paginated payments', async () => {
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.payment.count.mockResolvedValue(0);

      const result = await service.getAllPayments({ page: 1, limit: 10, sortOrder: 'desc' });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should apply status filter', async () => {
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.payment.count.mockResolvedValue(0);

      await service.getAllPayments({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        status: 'SUCCEEDED',
      });

      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'SUCCEEDED' },
        }),
      );
    });
  });

  describe('refund', () => {
    const mockSucceededPayment = {
      ...mockPayment,
      status: 'SUCCEEDED',
      amount: 75.48,
      refundedAmount: 0,
    };

    it('should initiate full refund', async () => {
      prisma.payment.findUnique.mockResolvedValue(mockSucceededPayment);
      prisma.payment.update.mockResolvedValue({
        ...mockSucceededPayment,
        status: 'REFUND_PENDING',
      });

      await service.refund(paymentId, {});

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent: stripeIntentId,
          amount: 7548, // 75.48 PLN in groszy
          reason: 'requested_by_customer',
        }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: expect.objectContaining({
          status: 'REFUND_PENDING',
          stripeRefundId: 're_test_123',
        }),
        select: expect.any(Object),
      });
    });

    it('should initiate partial refund', async () => {
      prisma.payment.findUnique.mockResolvedValue(mockSucceededPayment);
      prisma.payment.update.mockResolvedValue({});

      await service.refund(paymentId, { amount: 25.0, reason: 'Partial refund' });

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2500,
          metadata: { reason: 'Partial refund' },
        }),
        expect.any(Object),
      );
    });

    it('should throw NotFoundException when payment not found', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(service.refund('nonexistent', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for non-refundable status', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: 'PENDING',
      });

      await expect(service.refund(paymentId, {})).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when refund amount exceeds refundable', async () => {
      prisma.payment.findUnique.mockResolvedValue(mockSucceededPayment);

      await expect(service.refund(paymentId, { amount: 100 })).rejects.toThrow(BadRequestException);
    });

    it('should allow refund of partially refunded payment', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockSucceededPayment,
        status: 'PARTIALLY_REFUNDED',
        refundedAmount: 25.48,
      });
      prisma.payment.update.mockResolvedValue({});

      await service.refund(paymentId, { amount: 50.0 });

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5000 }),
        expect.any(Object),
      );
    });
  });

  describe('expireAbandonedPayments', () => {
    it('should expire abandoned payments older than 24h', async () => {
      prisma.payment.findMany.mockResolvedValue([
        {
          id: paymentId,
          stripePaymentIntentId: stripeIntentId,
          orderId,
          order: { status: 'PENDING' },
        },
      ]);
      prisma.payment.update.mockResolvedValue({});
      ordersService.updateOrderStatus.mockResolvedValue({});

      const result = await service.expireAbandonedPayments();

      expect(result).toEqual({ expired: 1 });
      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(stripeIntentId);
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: {
          status: 'FAILED',
          failureCode: 'expired',
          failureMessage: 'Payment intent expired after 24 hours',
        },
      });
      expect(ordersService.updateOrderStatus).toHaveBeenCalledWith(orderId, {
        status: 'CANCELLED',
        adminNotes: 'Auto-cancelled: payment expired after 24 hours',
      });
    });

    it('should return zero when no abandoned payments', async () => {
      prisma.payment.findMany.mockResolvedValue([]);

      const result = await service.expireAbandonedPayments();

      expect(result).toEqual({ expired: 0 });
    });

    it('should skip order cancellation if order is not PENDING', async () => {
      prisma.payment.findMany.mockResolvedValue([
        {
          id: paymentId,
          stripePaymentIntentId: stripeIntentId,
          orderId,
          order: { status: 'CONFIRMED' },
        },
      ]);
      prisma.payment.update.mockResolvedValue({});

      await service.expireAbandonedPayments();

      expect(ordersService.updateOrderStatus).not.toHaveBeenCalled();
    });

    it('should continue processing when individual payment fails', async () => {
      prisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay1',
          stripePaymentIntentId: 'pi_1',
          orderId: 'order1',
          order: { status: 'PENDING' },
        },
        {
          id: 'pay2',
          stripePaymentIntentId: 'pi_2',
          orderId: 'order2',
          order: { status: 'PENDING' },
        },
      ]);

      stripe.paymentIntents.cancel
        .mockRejectedValueOnce(new Error('Stripe error'))
        .mockResolvedValueOnce({});
      prisma.payment.update.mockResolvedValue({});
      ordersService.updateOrderStatus.mockResolvedValue({});

      const result = await service.expireAbandonedPayments();

      expect(result).toEqual({ expired: 1 }); // Only second one succeeded
    });
  });
});
