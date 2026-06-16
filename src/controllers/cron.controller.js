const { runForecastTraining } = require('../services/forecastTraining.service');

const authorizeCronRequest = (req, res) => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    if (process.env.VERCEL) {
      res.status(500).json({
        success: false,
        message: 'CRON_SECRET is not configured',
      });
      return false;
    }

    return true;
  }

  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized cron request',
    });
    return false;
  }

  return true;
};

exports.runForecastCron = async (req, res) => {
  if (!authorizeCronRequest(req, res)) {
    return;
  }

  res.status(410).json({
    success: false,
    message:
      'Vercel cron forecasting is disabled. Production forecasts are trained with Prophet via GitHub Actions.',
    workflow: '.github/workflows/sales-forecast-prophet.yml',
  });
};

exports.runForecastManual = async (req, res) => {
  try {
    console.log('[forecast-manual] Manual forecast training triggered by admin.');
    const result = await runForecastTraining();

    res.json({
      success: true,
      message:
        'Node fallback forecast completed. For Prophet in production, run the GitHub Actions workflow.',
      data: result,
    });
  } catch (error) {
    console.error('[forecast-manual] Forecast training failed:', error);
    res.status(500).json({
      success: false,
      message: 'Forecast training failed',
      error: error.message,
    });
  }
};
