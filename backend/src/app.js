import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import { config } from './config.js';
import { authenticate } from './middleware/auth.js';
import { auditTrail } from './middleware/audit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import patientRoutes from './routes/patients.js';
import appointmentRoutes from './routes/appointments.js';
import encounterRoutes from './routes/encounters.js';
import { admissionsRouter, wardsRouter } from './routes/ipd.js';
import { surgeriesRouter, theatresRouter } from './routes/ot.js';
import { ordersRouter, testsRouter } from './routes/diagnostics.js';
import pharmacyRoutes from './routes/pharmacy.js';
import {
  itemsRouter, movementsRouter, purchaseOrdersRouter, suppliersRouter,
} from './routes/inventory.js';
import { claimsRouter, invoicesRouter, ledgerRouter } from './routes/billing.js';
import { departmentsRouter, shiftsRouter, usersRouter } from './routes/staff.js';
import reportRoutes from './routes/reports.js';
import { messagesRouter, notificationsRouter, templatesRouter } from './routes/communication.js';
import { auditRouter, backupRouter, settingsRouter } from './routes/admin.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());
  app.use(morgan(config.isProd ? 'combined' : 'dev', { skip: (req) => req.path === '/api/public/health' }));

  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);

  const api = express.Router();
  api.use(authenticate, auditTrail);
  api.use('/patients', patientRoutes);
  api.use('/appointments', appointmentRoutes);
  api.use('/encounters', encounterRoutes);
  api.use('/wards', wardsRouter);
  api.use('/admissions', admissionsRouter);
  api.use('/theatres', theatresRouter);
  api.use('/surgeries', surgeriesRouter);
  api.use('/lab-tests', testsRouter);
  api.use('/lab-orders', ordersRouter);
  api.use('/pharmacy', pharmacyRoutes);
  api.use('/inventory/items', itemsRouter);
  api.use('/inventory/movements', movementsRouter);
  api.use('/inventory/purchase-orders', purchaseOrdersRouter);
  api.use('/suppliers', suppliersRouter);
  api.use('/invoices', invoicesRouter);
  api.use('/claims', claimsRouter);
  api.use('/ledger', ledgerRouter);
  api.use('/users', usersRouter);
  api.use('/departments', departmentsRouter);
  api.use('/shifts', shiftsRouter);
  api.use('/reports', reportRoutes);
  api.use('/notifications', notificationsRouter);
  api.use('/messages', messagesRouter);
  api.use('/templates', templatesRouter);
  api.use('/settings', settingsRouter);
  api.use('/audit', auditRouter);
  api.use('/backups', backupRouter);
  app.use('/api', api);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
