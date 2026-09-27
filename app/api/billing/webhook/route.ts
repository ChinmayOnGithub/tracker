/**
 * Legacy & Compatibility Route for Razorpay Webhook
 * Delegates directly to the canonical /api/webhooks/razorpay handler.
 */
export { POST, dynamic } from '@/app/api/webhooks/razorpay/route'
