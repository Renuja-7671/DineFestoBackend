const { runForecastTraining } = require('./forecastTraining.service');

const toBool = (value) => String(value).toLowerCase() === 'true';

let running = false;

const runForecastJob = async () => {
  if (running) {
    console.log('[forecast-scheduler] Previous job still running. Skipping this cycle.');
    return;
  }

  running = true;
  const startTime = Date.now();

  try {
    console.log('[forecast-scheduler] Starting forecast training job...');
    const result = await runForecastTraining();
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[forecast-scheduler] Forecast training completed in ${durationSec}s.`,
      result
    );
  } catch (error) {
    console.error('[forecast-scheduler] Forecast training failed:', error.message);
    throw error;
  } finally {
    running = false;
  }
};

const startForecastScheduler = async () => {
  if (!toBool(process.env.FORECAST_SCHEDULER_ENABLED || 'false')) {
    console.log('[forecast-scheduler] Scheduler is disabled (FORECAST_SCHEDULER_ENABLED=false).');
    return;
  }

  if (process.env.VERCEL) {
    console.log('[forecast-scheduler] Skipped on Vercel — use Vercel Cron at /api/cron/forecast.');
    return;
  }

  const hour = Number.parseInt(process.env.FORECAST_SCHEDULE_HOUR || '2', 10);
  const minute = Number.parseInt(process.env.FORECAST_SCHEDULE_MINUTE || '0', 10);
  const runOnStartup = toBool(process.env.FORECAST_RUN_ON_STARTUP || 'true');

  console.log(
    `[forecast-scheduler] Local scheduler enabled. Daily run at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}.`
  );
  console.log('[forecast-scheduler] For production on Vercel, configure crons in vercel.json instead.');

  if (runOnStartup) {
    try {
      await runForecastJob();
    } catch (error) {
      console.error('[forecast-scheduler] Startup forecast run failed:', error.message);
    }
  }

  const scheduleNextRun = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    const waitMs = next.getTime() - now.getTime();
    setTimeout(async () => {
      try {
        await runForecastJob();
      } catch (error) {
        console.error('[forecast-scheduler] Scheduled forecast run failed:', error.message);
      } finally {
        scheduleNextRun();
      }
    }, waitMs);

    console.log(`[forecast-scheduler] Next local run scheduled at ${next.toISOString()}`);
  };

  scheduleNextRun();
};

const stopForecastScheduler = () => {
  // Local setTimeout handles are not tracked individually; process exit is sufficient for dev.
};

module.exports = {
  runForecastJob,
  startForecastScheduler,
  stopForecastScheduler,
};
