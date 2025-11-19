import SparkPost from 'sparkpost';
import { getUnnotifiedMentions, markMentionNotified } from './db.js';

// Initialize SparkPost client
const client = process.env.SPARKPOST_API_KEY 
  ? new SparkPost(process.env.SPARKPOST_API_KEY)
  : null;

/**
 * Send email notification when a user is mentioned in a comment
 */
export async function sendMentionNotification(mention) {
  if (!client) {
    console.warn('⚠️  SparkPost not configured - skipping email notification');
    return;
  }

  try {
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const pageUrl = `${appUrl}/session/${mention.sessionId}`;
    
    await client.transmissions.send({
      content: {
        from: process.env.SPARKPOST_FROM_EMAIL || 'notifications@wiki-jam.com',
        subject: `${mention.commenterName} mentioned you in ${mention.pageFilename}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #667eea; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
              .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
              .comment { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #667eea; }
              .button { 
                display: inline-block; 
                background: #667eea; 
                color: white; 
                padding: 12px 24px; 
                text-decoration: none; 
                border-radius: 6px; 
                margin-top: 15px;
              }
              .footer { color: #6b7280; font-size: 12px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>📝 You were mentioned in Wiki Jam</h2>
              </div>
              <div class="content">
                <p><strong>${mention.commenterName}</strong> mentioned you in a comment on <strong>${mention.pageFilename}</strong>:</p>
                <div class="comment">
                  ${mention.commentContent}
                </div>
                <a href="${pageUrl}" class="button">View Comment</a>
                <div class="footer">
                  <p>This is an automated notification from Wiki Jam. You received this because you were mentioned in a comment.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `
      },
      recipients: [
        { 
          address: mention.mentionedEmail,
          substitution_data: {
            name: mention.mentionedName
          }
        }
      ]
    });
    
    console.log(`📧 Sent mention notification to ${mention.mentionedEmail}`);
    
    // Mark mention as notified
    await markMentionNotified(mention.id);
  } catch (err) {
    console.error('❌ Error sending mention notification:', err);
    throw err;
  }
}

/**
 * Process all unnotified mentions and send emails
 */
export async function processUnnotifiedMentions() {
  try {
    const mentions = await getUnnotifiedMentions();
    
    if (mentions.length === 0) {
      return;
    }
    
    console.log(`📬 Processing ${mentions.length} unnotified mentions`);
    
    for (const mention of mentions) {
      try {
        await sendMentionNotification(mention);
      } catch (err) {
        console.error(`❌ Failed to send notification for mention ${mention.id}:`, err);
      }
    }
  } catch (err) {
    console.error('❌ Error processing unnotified mentions:', err);
  }
}

/**
 * Start periodic check for unnotified mentions
 * DISABLED: Only send emails when comments are explicitly assigned
 */
export function startNotificationService() {
  if (!client) {
    console.warn('⚠️  SparkPost not configured - notification service disabled');
    return;
  }

  console.log('📬 Notification service ready (emails only sent for assigned comments)');

  // Background job disabled - emails are only sent when comments are assigned
  // processUnnotifiedMentions();
  // setInterval(processUnnotifiedMentions, 30000);
}

