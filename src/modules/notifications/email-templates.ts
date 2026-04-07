// ============================================
// Email template functions - pure TS, no template engine
// Each returns { subject, html } for use with Resend API
// ============================================

/**
 * Escapes HTML special characters to prevent HTML injection.
 * Must be applied to ALL user-controlled content before interpolation.
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Shared wrapper that adds consistent styling to all emails
function wrapHtml(title: string, body: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">${title}</h1>
      ${body}
      <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
      <p style="color: #999; font-size: 12px;">This is an automated message. Please do not reply.</p>
    </div>
  `;
}

// ============================================
// AUTH TEMPLATES
// ============================================

export function welcomeEmail(firstName: string | null): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  return {
    subject: 'Welcome to our store!',
    html: wrapHtml(
      'Welcome!',
      `<p>Hi ${safeName},</p>
       <p>Thank you for creating an account. We're excited to have you!</p>
       <p>Start browsing our products and find something you love.</p>`,
    ),
  };
}

export function passwordChangedEmail(firstName: string | null): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  return {
    subject: 'Your password has been changed',
    html: wrapHtml(
      'Password Changed',
      `<p>Hi ${safeName},</p>
       <p>Your password was successfully changed.</p>
       <p>If you did not make this change, please contact support immediately.</p>`,
    ),
  };
}

export function emailVerificationEmail(
  firstName: string | null,
  verifyUrl: string,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeUrl = escapeHtml(verifyUrl);
  return {
    subject: 'Verify your email address',
    html: wrapHtml(
      'Verify Your Email',
      `<p>Hi ${safeName},</p>
       <p>Please verify your email address by clicking the button below:</p>
       <p style="margin: 20px 0;">
         <a href="${safeUrl}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email</a>
       </p>
       <p style="color: #666; font-size: 14px;">Or copy this link: <a href="${safeUrl}">${safeUrl}</a></p>
       <p style="color: #666; font-size: 14px;">This link expires in 24 hours.</p>`,
    ),
  };
}

export function passwordResetEmail(
  firstName: string | null,
  resetUrl: string,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeUrl = escapeHtml(resetUrl);
  return {
    subject: 'Reset your password',
    html: wrapHtml(
      'Reset Your Password',
      `<p>Hi ${safeName},</p>
       <p>We received a request to reset your password. Click the button below to create a new password:</p>
       <p style="margin: 20px 0;">
         <a href="${safeUrl}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
       </p>
       <p style="color: #666; font-size: 14px;">Or copy this link: <a href="${safeUrl}">${safeUrl}</a></p>
       <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>
       <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>`,
    ),
  };
}

// ============================================
// ORDER TEMPLATES
// ============================================

export function orderCreatedEmail(
  firstName: string | null,
  orderNumber: string,
  total: string, // Pre-formatted decimal string (e.g., "129.99")
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeOrderNumber = escapeHtml(orderNumber);
  const safeTotal = escapeHtml(total);
  return {
    subject: `Order ${safeOrderNumber} confirmed`,
    html: wrapHtml(
      'Order Confirmed',
      `<p>Hi ${safeName},</p>
       <p>Your order <strong>${safeOrderNumber}</strong> has been placed successfully.</p>
       <p>Total: <strong>${safeTotal} PLN</strong></p>
       <p>We'll notify you when your order ships.</p>`,
    ),
  };
}

export function orderShippedEmail(
  firstName: string | null,
  orderNumber: string,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeOrderNumber = escapeHtml(orderNumber);
  return {
    subject: `Order ${safeOrderNumber} shipped`,
    html: wrapHtml(
      'Order Shipped',
      `<p>Hi ${safeName},</p>
       <p>Your order <strong>${safeOrderNumber}</strong> is on its way!</p>
       <p>You'll receive another notification when it's delivered.</p>`,
    ),
  };
}

export function orderDeliveredEmail(
  firstName: string | null,
  orderNumber: string,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeOrderNumber = escapeHtml(orderNumber);
  return {
    subject: `Order ${safeOrderNumber} delivered`,
    html: wrapHtml(
      'Order Delivered',
      `<p>Hi ${safeName},</p>
       <p>Your order <strong>${safeOrderNumber}</strong> has been delivered.</p>
       <p>We hope you enjoy your purchase! Consider leaving a review.</p>`,
    ),
  };
}

export function orderCancelledEmail(
  firstName: string | null,
  orderNumber: string,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeOrderNumber = escapeHtml(orderNumber);
  return {
    subject: `Order ${safeOrderNumber} cancelled`,
    html: wrapHtml(
      'Order Cancelled',
      `<p>Hi ${safeName},</p>
       <p>Your order <strong>${safeOrderNumber}</strong> has been cancelled.</p>
       <p>If you were charged, a refund will be processed automatically.</p>`,
    ),
  };
}

// ============================================
// PAYMENT TEMPLATES
// ============================================

export function paymentSucceededEmail(
  firstName: string | null,
  orderNumber: string,
  amount: string,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeOrderNumber = escapeHtml(orderNumber);
  const safeAmount = escapeHtml(amount);
  return {
    subject: `Payment received for order ${safeOrderNumber}`,
    html: wrapHtml(
      'Payment Received',
      `<p>Hi ${safeName},</p>
       <p>We've received your payment of <strong>${safeAmount} PLN</strong> for order <strong>${safeOrderNumber}</strong>.</p>
       <p>Your order is now being processed.</p>`,
    ),
  };
}

export function paymentFailedEmail(
  firstName: string | null,
  orderNumber: string,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeOrderNumber = escapeHtml(orderNumber);
  return {
    subject: `Payment failed for order ${safeOrderNumber}`,
    html: wrapHtml(
      'Payment Failed',
      `<p>Hi ${safeName},</p>
       <p>Your payment for order <strong>${safeOrderNumber}</strong> was not successful.</p>
       <p>Please try again or use a different payment method.</p>`,
    ),
  };
}

export function refundInitiatedEmail(
  firstName: string | null,
  orderNumber: string,
  amount: string,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeOrderNumber = escapeHtml(orderNumber);
  const safeAmount = escapeHtml(amount);
  return {
    subject: `Refund initiated for order ${safeOrderNumber}`,
    html: wrapHtml(
      'Refund Initiated',
      `<p>Hi ${safeName},</p>
       <p>A refund of <strong>${safeAmount} PLN</strong> has been initiated for order <strong>${safeOrderNumber}</strong>.</p>
       <p>Please allow 5-10 business days for the refund to appear on your statement.</p>`,
    ),
  };
}

export function refundCompletedEmail(
  firstName: string | null,
  orderNumber: string,
  amount: string,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeOrderNumber = escapeHtml(orderNumber);
  const safeAmount = escapeHtml(amount);
  return {
    subject: `Refund completed for order ${safeOrderNumber}`,
    html: wrapHtml(
      'Refund Completed',
      `<p>Hi ${safeName},</p>
       <p>Your refund of <strong>${safeAmount} PLN</strong> for order <strong>${safeOrderNumber}</strong> has been completed.</p>
       <p>The amount should appear on your statement shortly.</p>`,
    ),
  };
}

export function refundFailedEmail(
  firstName: string | null,
  orderNumber: string,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeOrderNumber = escapeHtml(orderNumber);
  return {
    subject: `Refund issue for order ${safeOrderNumber}`,
    html: wrapHtml(
      'Refund Issue',
      `<p>Hi ${safeName},</p>
       <p>There was an issue processing the refund for order <strong>${safeOrderNumber}</strong>.</p>
       <p>Our team has been notified and will resolve this shortly. Please contact support if needed.</p>`,
    ),
  };
}

// ============================================
// INVENTORY TEMPLATES (admin only)
// ============================================

export function lowStockEmail(
  productName: string,
  currentStock: number,
  threshold: number,
): { subject: string; html: string } {
  const safeProductName = escapeHtml(productName);
  return {
    subject: `Low stock alert: ${safeProductName}`,
    html: wrapHtml(
      'Low Stock Alert',
      `<p><strong>${safeProductName}</strong> is running low on stock.</p>
       <p>Current stock: <strong>${currentStock}</strong> (threshold: ${threshold})</p>
       <p>Please restock soon to avoid stockouts.</p>`,
    ),
  };
}

// ============================================
// REVIEW TEMPLATES (admin only)
// ============================================

export function reviewCreatedAdminEmail(
  reviewerName: string,
  productName: string,
  rating: number,
  title: string,
): { subject: string; html: string } {
  const safeName = escapeHtml(reviewerName);
  const safeProduct = escapeHtml(productName);
  const safeTitle = escapeHtml(title);
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  return {
    subject: `New review pending moderation: ${safeProduct}`,
    html: wrapHtml(
      'New Review Submitted',
      `<p>A new review has been submitted and needs moderation.</p>
       <p><strong>Product:</strong> ${safeProduct}</p>
       <p><strong>Reviewer:</strong> ${safeName}</p>
       <p><strong>Rating:</strong> ${stars} (${rating}/5)</p>
       <p><strong>Title:</strong> ${safeTitle}</p>
       <p>Please review and approve or reject in the admin dashboard.</p>`,
    ),
  };
}

// ============================================
// REFUND REQUEST TEMPLATES
// ============================================

export function refundRequestReceivedEmail(
  firstName: string | null,
  orderNumber: string,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeOrderNumber = escapeHtml(orderNumber);
  return {
    subject: `Refund request received for order ${safeOrderNumber}`,
    html: wrapHtml(
      'Refund Request Received',
      `<p>Hi ${safeName},</p>
       <p>We've received your refund request for order <strong>${safeOrderNumber}</strong>.</p>
       <p>Our team will review your request and get back to you within 2-3 business days.</p>
       <p>You can check the status of your request in your order history.</p>`,
    ),
  };
}

export function refundRequestApprovedEmail(
  firstName: string | null,
  orderNumber: string,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeOrderNumber = escapeHtml(orderNumber);
  return {
    subject: `Refund request approved for order ${safeOrderNumber}`,
    html: wrapHtml(
      'Refund Request Approved',
      `<p>Hi ${safeName},</p>
       <p>Great news! Your refund request for order <strong>${safeOrderNumber}</strong> has been approved.</p>
       <p>The refund will be processed shortly and you'll receive a confirmation once it's complete.</p>`,
    ),
  };
}

export function refundRequestRejectedEmail(
  firstName: string | null,
  orderNumber: string,
  reason: string | null,
): { subject: string; html: string } {
  const safeName = firstName ? escapeHtml(firstName) : 'there';
  const safeOrderNumber = escapeHtml(orderNumber);
  const safeReason = reason ? escapeHtml(reason) : null;
  return {
    subject: `Refund request update for order ${safeOrderNumber}`,
    html: wrapHtml(
      'Refund Request Update',
      `<p>Hi ${safeName},</p>
       <p>We've reviewed your refund request for order <strong>${safeOrderNumber}</strong>.</p>
       <p>Unfortunately, we're unable to process your refund at this time.</p>
       ${safeReason ? `<p><strong>Reason:</strong> ${safeReason}</p>` : ''}
       <p>If you have any questions, please contact our support team.</p>`,
    ),
  };
}

export function refundRequestAdminEmail(
  orderNumber: string,
  customerEmail: string,
  reason: string,
): { subject: string; html: string } {
  const safeOrderNumber = escapeHtml(orderNumber);
  const safeEmail = escapeHtml(customerEmail);
  const safeReason = escapeHtml(reason);
  return {
    subject: `New refund request: ${safeOrderNumber}`,
    html: wrapHtml(
      'New Refund Request',
      `<p>A customer has submitted a refund request.</p>
       <p><strong>Order:</strong> ${safeOrderNumber}</p>
       <p><strong>Customer:</strong> ${safeEmail}</p>
       <p><strong>Reason:</strong></p>
       <p style="background: #f5f5f5; padding: 12px; border-radius: 4px;">${safeReason}</p>
       <p>Please review this request in the admin dashboard.</p>`,
    ),
  };
}
