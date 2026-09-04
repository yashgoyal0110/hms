import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { Message, MessageTemplate, getSettings } from '../models/index.js';

let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

export const gatewayStatus = () => ({
  email: Boolean(transporter),
  sms: Boolean(config.sms.url),
  whatsapp: Boolean(config.sms.url),
});

export function renderTemplate(text, vars) {
  return String(text || '').replace(/{{\s*(\w+)\s*}}/g, (_, k) => (vars[k] ?? ''));
}

export async function sendMessage({ patient, channel, to, subject, body, template, sentBy, automatic = false }) {
  const msg = await Message.create({ patient, channel, to, subject, body, template, sentBy, automatic, status: 'Queued' });
  try {
    if (channel === 'Email' && transporter) {
      await transporter.sendMail({ from: config.smtp.from || config.smtp.user, to, subject: subject || 'Notification', text: body });
      msg.status = 'Sent';
    } else if ((channel === 'SMS' || channel === 'WhatsApp') && config.sms.url) {
      const res = await fetch(config.sms.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.sms.token ? { Authorization: `Bearer ${config.sms.token}` } : {}),
        },
        body: JSON.stringify({ to, message: body, channel, sender: config.sms.sender }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Gateway responded ${res.status}`);
      msg.status = 'Sent';
    } else {
      msg.status = 'Logged';
      msg.error = `${channel} gateway not configured; message recorded only`;
    }
  } catch (e) {
    msg.status = 'Failed';
    msg.error = e.message;
  }
  await msg.save();
  return msg;
}

// Fire automatic patient communication for an event if an active auto-send template exists.
export async function notifyPatient(key, patient, vars = {}) {
  try {
    if (!patient) return;
    const templates = await MessageTemplate.find({ key: new RegExp(`^${key}(_email)?$`), active: true, autoSend: true });
    if (!templates.length) return;
    const settings = await getSettings();
    const all = {
      patientName: [patient.firstName, patient.lastName].filter(Boolean).join(' '),
      uhid: patient.uhid,
      hospitalName: settings.name,
      hospitalPhone: settings.phone,
      ...vars,
    };
    for (const t of templates) {
      const to = t.channel === 'Email' ? patient.email : patient.phone;
      if (!to) continue;
      await sendMessage({
        patient: patient._id, channel: t.channel, to,
        subject: renderTemplate(t.subject, all), body: renderTemplate(t.body, all), template: t.key, automatic: true,
      });
    }
  } catch (e) {
    console.error('[messaging]', e.message);
  }
}
