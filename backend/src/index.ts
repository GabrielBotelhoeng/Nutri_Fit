import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { healthRouter } from './routes/health';
import { apiRouter } from './routes/api';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rotas
app.use('/health', healthRouter);
app.use('/api', apiRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Iniciar servidor
const server = app.listen(env.PORT, () => {
  console.log(`[nutrichat-backend] Rodando na porta ${env.PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[nutrichat-backend] SIGTERM recebido, encerrando...');
  server.close(() => process.exit(0));
});

export { app, server };
