import { app } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';

async function startServer() {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('✅ Connected to MongoDB');

    const server = app.listen(env.PORT, () => {
      console.log(`🚀 MedConsults CRM Backend running on port ${env.PORT} in ${env.NODE_ENV} mode`);
      console.log(`   Health check: http://localhost:${env.PORT}/health`);
      console.log(`   Readiness check: http://localhost:${env.PORT}/ready`);
    });

    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDB();
        console.log('MongoDB connection closed. Server shut down.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
