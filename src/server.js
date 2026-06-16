const app = require('./app');
const config = require('./config');
const prisma = require('./config/database');
const {
  startForecastScheduler,
  stopForecastScheduler,
} = require('./services/forecastScheduler.service');

process.on('SIGINT', async () => {
  console.log('\n⚠️  Shutting down gracefully...');
  stopForecastScheduler();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Shutting down gracefully...');
  stopForecastScheduler();
  await prisma.$disconnect();
  process.exit(0);
});

const PORT = config.port;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${config.nodeEnv}`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);

  if (!process.env.VERCEL) {
    startForecastScheduler();
  }
});
