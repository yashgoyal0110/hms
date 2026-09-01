import mongoose from 'mongoose';
import { config } from './config.js';

mongoose.set('strictQuery', true);

export async function connectDb() {
  let attempt = 0;
  for (;;) {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 20 });
      console.log('[db] connected');
      return;
    } catch (err) {
      attempt += 1;
      if (attempt >= 20) throw err;
      console.warn(`[db] connection failed (${err.message}); retrying in 3s`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
