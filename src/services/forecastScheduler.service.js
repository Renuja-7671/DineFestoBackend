const path = require('path');
const { spawn } = require('child_process');

const toBool = value => String(value).toLowerCase() === 'true';

const schedulerConfig = {
  enabled: toBool(process.env.FORECAST_SCHEDULER_ENABLED || 'false'),
  runOnStartup: toBool(process.env.FORECAST_RUN_ON_STARTUP || 'true'),
  hour: Number.parseInt(process.env.FORECAST_SCHEDULE_HOUR || '2', 10),
  minute: Number.parseInt(process.env.FORECAST_SCHEDULE_MINUTE || '0', 10),
  pythonPath: process.env.FORECAST_PYTHON_PATH || '.venv-forecast/bin/python',
  scriptPath:
    process.env.FORECAST_SCRIPT_PATH ||
    path.resolve(__dirname, '../../forecasting/train_sales_forecast.py'),
};

let timeoutRef = null;
let running = false;

const getMsUntilNextRun = (hour, minute) => {
  const now = new Date();
  const next = new Date(now);

  next.setHours(hour, minute, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
};

const runForecastJob = () =>
  new Promise((resolve, reject) => {
    if (running) {
      console.log('[forecast-scheduler] Previous job still running. Skipping this cycle.');
      return resolve();
    }

    running = true;
    const startTime = Date.now();
    console.log('[forecast-scheduler] Starting forecast training job...');

    const child = spawn(schedulerConfig.pythonPath, [schedulerConfig.scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    child.stdout.on('data', data => {
      process.stdout.write(`[forecast-scheduler] ${data}`);
    });

    child.stderr.on('data', data => {
      process.stderr.write(`[forecast-scheduler][error] ${data}`);
    });

    child.on('close', code => {
      running = false;
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      if (code === 0) {
        console.log(
          `[forecast-scheduler] Forecast training completed successfully in ${durationSec}s.`
        );
        resolve();
      } else {
        reject(new Error(`Forecast training failed with exit code ${code}`));
      }
    });

    child.on('error', error => {
      running = false;
      reject(error);
    });
  });

const scheduleNextRun = () => {
  const waitMs = getMsUntilNextRun(schedulerConfig.hour, schedulerConfig.minute);

  timeoutRef = setTimeout(async () => {
    try {
      await runForecastJob();
    } catch (error) {
      console.error('[forecast-scheduler] Scheduled forecast run failed:', error.message);
    } finally {
      scheduleNextRun();
    }
  }, waitMs);

  const nextRunAt = new Date(Date.now() + waitMs).toISOString();
  console.log(`[forecast-scheduler] Next run scheduled at ${nextRunAt}`);
};

const startForecastScheduler = async () => {
  if (!schedulerConfig.enabled) {
    console.log('[forecast-scheduler] Scheduler is disabled (FORECAST_SCHEDULER_ENABLED=false).');
    return;
  }

  console.log(
    `[forecast-scheduler] Enabled. Daily run at ${String(schedulerConfig.hour).padStart(
      2,
      '0'
    )}:${String(schedulerConfig.minute).padStart(2, '0')}.`
  );

  if (schedulerConfig.runOnStartup) {
    try {
      await runForecastJob();
    } catch (error) {
      console.error('[forecast-scheduler] Startup forecast run failed:', error.message);
    }
  }

  scheduleNextRun();
};

const stopForecastScheduler = () => {
  if (timeoutRef) {
    clearTimeout(timeoutRef);
    timeoutRef = null;
  }
};

module.exports = {
  startForecastScheduler,
  stopForecastScheduler,
};
