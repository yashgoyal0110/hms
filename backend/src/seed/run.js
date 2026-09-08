// Manual seeding entry point: `npm run seed` (requires SEED_DEMO semantics regardless of env flag).
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { bootstrap } from './bootstrap.js';
import { seedDemoData } from './demo.js';

await connectDb();
await bootstrap();
await seedDemoData();
await mongoose.disconnect();
