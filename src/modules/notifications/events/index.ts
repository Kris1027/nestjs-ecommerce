export {
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  RefundRequestCreatedEvent,
} from './order.events';
export {
  PaymentSucceededEvent,
  PaymentFailedEvent,
  RefundInitiatedEvent,
  RefundCompletedEvent,
  RefundFailedEvent,
} from './payment.events';
export { LowStockEvent } from './inventory.events';
export { UserRegisteredEvent, PasswordChangedEvent } from './auth.events';
export { ReviewCreatedEvent } from './review.events';

// Event name constants — used in @OnEvent() decorators and eventEmitter.emit()
// String constants prevent typos: NotificationEvents.ORDER_CREATED vs ('order.created');
export const NotificationEvents = {
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_CHANGED: 'order.status.changed',
  REFUND_REQUEST_CREATED: 'refund.request.created',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  REFUND_INITIATED: 'refund.initiated',
  REFUND_COMPLETED: 'refund.completed',
  REFUND_FAILED: 'refund.failed',
  REVIEW_CREATED: 'review.created',
  LOW_STOCK: 'inventory.low_stock',
  USER_REGISTERED: 'auth.user.registered',
  PASSWORD_CHANGED: 'auth.password.changed',
} as const;
