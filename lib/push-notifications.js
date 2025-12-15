// Push Notification Server Utilities
import webPush from 'web-push';

// Generate VAPID keys if not set in environment
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BLBxgWuzPF7LFJjwWqW1QvJp_VjkCvEuRVJbMNNKGqLQFq5JHO_J4HgfX_3YhvC3RCVMqmRPxnJ7UvYVH_bLOVY',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'YVxUo_0sWlJ5WQHK-8vAzs_9jNNfwPPhxksmQ_4YZ5Q'
};

// Configure web-push
webPush.setVapidDetails(
  'mailto:admin@workspace.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Send push notification to a single subscription
export async function sendPushNotification(subscription, payload) {
  try {
    const options = {
      TTL: 60 * 60, // 1 hour
      urgency: payload.urgency || 'normal', // low, normal, high, very-high
    };
    
    await webPush.sendNotification(
      subscription,
      JSON.stringify(payload),
      options
    );
    
    console.log('[Push] Notification sent successfully');
    return { success: true };
  } catch (error) {
    console.error('[Push] Error sending notification:', error);
    
    // Handle expired subscription
    if (error.statusCode === 410 || error.statusCode === 404) {
      return { success: false, expired: true };
    }
    
    return { success: false, error: error.message };
  }
}

// Send push notification to multiple subscriptions
export async function sendBulkPushNotifications(subscriptions, payload) {
  const results = await Promise.allSettled(
    subscriptions.map(sub => sendPushNotification(sub.subscription, payload))
  );
  
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.length - succeeded;
  
  console.log(`[Push] Bulk send: ${succeeded} succeeded, ${failed} failed`);
  return { succeeded, failed };
}

// Get VAPID public key for client
export function getVapidPublicKey() {
  return vapidKeys.publicKey;
}

export { vapidKeys };
