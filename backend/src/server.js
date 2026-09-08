import mongoose from 'mongoose';
import { config } from './config.js';
import { connectDb } from './db.js';
import { createApp } from './app.js';
import { bootstrap } from './seed/bootstrap.js';

async function main() {
  await connectDb();
  await bootstrap();
  const app = createApp();
  const server = app.listen(config.port, () => console.log(`[api] listening on :${config.port} (${config.env})`));

  const shutdown = (sig) => {
    console.log(`[api] ${sig} received, shutting down`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[api] fatal', err);
  process.exit(1);
});
