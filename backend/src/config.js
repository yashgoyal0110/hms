const isProd = process.env.NODE_ENV === 'production';

function env(key, fallback) {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (fallback === undefined) throw new Error(`Missing required environment variable ${key}`);
    return fallback;
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT || 4000),
  mongoUri: env('MONGO_URI', isProd ? undefined : 'mongodb://127.0.0.1:27017/hms'),
  jwtSecret: env('JWT_SECRET', isProd ? undefined : 'development-only-secret-change-me-please'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
  trustProxy: process.env.TRUST_PROXY || '1',
  admin: {
    name: process.env.ADMIN_NAME || 'System Administrator',
    email: (process.env.ADMIN_EMAIL || 'admin@hospital.local').toLowerCase(),
    password: env('ADMIN_PASSWORD', isProd ? undefined : 'Admin@12345'),
  },
  seedDemo: process.env.SEED_DEMO === 'true',
  demoMode: process.env.DEMO_MODE === 'true',
  backupDir: process.env.BACKUP_DIR || '/backups',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
  sms: {
    url: process.env.SMS_WEBHOOK_URL || '',
    token: process.env.SMS_WEBHOOK_TOKEN || '',
    sender: process.env.SMS_SENDER_ID || 'HOSPTL',
  },
};

if (isProd && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
