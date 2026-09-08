import { config } from '../config.js';
import { MessageTemplate, User, getSettings } from '../models/index.js';
import { seedDemoData } from './demo.js';

const DEFAULT_TEMPLATES = [
  {
    key: 'appointment_booked', name: 'Appointment confirmation', channel: 'SMS', autoSend: true,
    body: 'Dear {{patientName}}, your appointment {{appointmentNo}} with Dr. {{doctorName}} is confirmed for {{date}} at {{time}}. - {{hospitalName}}',
  },
  {
    key: 'appointment_reminder', name: 'Appointment reminder', channel: 'SMS', autoSend: false,
    body: 'Reminder: Dear {{patientName}}, you have an appointment at {{hospitalName}} tomorrow. Please arrive 15 minutes early. Call {{hospitalPhone}} to reschedule.',
  },
  {
    key: 'report_ready', name: 'Report ready', channel: 'SMS', autoSend: true,
    body: 'Dear {{patientName}}, your report ({{tests}}) for order {{orderNo}} is ready. Collect it from the counter or contact {{hospitalPhone}}. - {{hospitalName}}',
  },
  {
    key: 'payment_received', name: 'Payment receipt', channel: 'SMS', autoSend: true,
    body: 'Received Rs. {{amount}} against invoice {{invoiceNo}} (Receipt {{receiptNo}}). Thank you. - {{hospitalName}}',
  },
  {
    key: 'discharge', name: 'Discharge message', channel: 'SMS', autoSend: true,
    body: 'Dear {{patientName}}, you have been discharged ({{admissionNo}}). Please follow the advice in your discharge summary. Wishing you a speedy recovery. - {{hospitalName}}',
  },
  {
    key: 'follow_up', name: 'Follow-up reminder', channel: 'SMS', autoSend: false,
    body: 'Dear {{patientName}}, this is a reminder for your follow-up visit at {{hospitalName}}. Call {{hospitalPhone}} to book a slot.',
  },
  {
    key: 'health_camp', name: 'Health camp announcement', channel: 'Email', autoSend: false,
    subject: 'Free health check-up camp at {{hospitalName}}',
    body: 'Dear {{patientName}},\n\n{{hospitalName}} is organising a free health check-up camp this Sunday from 9 AM to 1 PM. Blood pressure, sugar and BMI screening will be available.\n\nFor details call {{hospitalPhone}}.\n\nRegards,\n{{hospitalName}}',
  },
];

export async function bootstrap() {
  await getSettings();
  for (const t of DEFAULT_TEMPLATES) {
    await MessageTemplate.updateOne({ key: t.key }, { $setOnInsert: t }, { upsert: true });
  }
  const admins = await User.countDocuments({ role: 'admin' });
  if (!admins) {
    await User.create({
      name: config.admin.name, email: config.admin.email, password: config.admin.password, role: 'admin', designation: 'System Administrator', employeeId: 'EMP-0000',
    });
    console.log(`[bootstrap] created administrator ${config.admin.email}`);
  }
  if (config.seedDemo) {
    try {
      await seedDemoData();
    } catch (err) {
      // Never crash-loop the API because of demo data; log and continue serving.
      console.error('[seed] demo data failed:', err.message);
    }
  }
}
