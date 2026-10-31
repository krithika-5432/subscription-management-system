import cors from 'cors';
import express from 'express';
import { env } from './config/environment.js';
import { startScheduler } from './jobs/scheduler.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { api } from './routes/index.js';

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: env.clientUrl }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', api);
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}/api`);
  if (env.schedulerEnabled) startScheduler();
});
