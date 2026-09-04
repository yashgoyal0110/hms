import { Notification, User } from '../models/index.js';

// In-app notifications for staff. Never throws - notifications must not break the main flow.
export async function notifyStaff({ roles, users, title, message, link, type = 'info' }) {
  try {
    let recipients = users ? users.map(String) : [];
    if (roles?.length) {
      const found = await User.find({ role: { $in: roles }, active: true }).select('_id');
      recipients = recipients.concat(found.map((u) => String(u._id)));
    }
    const unique = [...new Set(recipients)];
    if (!unique.length) return;
    await Notification.insertMany(unique.map((user) => ({ user, title, message, link, type })));
  } catch (e) {
    console.error('[notify]', e.message);
  }
}
