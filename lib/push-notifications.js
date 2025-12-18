// Push Notification Server Utilities
import webPush from 'web-push';

// VAPID keys must be set in environment variables
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

// Only configure web-push if VAPID keys are available
if (vapidKeys.publicKey && vapidKeys.privateKey) {
  webPush.setVapidDetails(
    process.env.VAPID_MAILTO || 'mailto:admin@workspace.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
}

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
