import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { healthRouter } from './routes/health';
import { apiRouter } from './routes/api';

const app = express();

// Confia no proxy Railway/Vercel para X-Forwarded-For (rate-limit real IP).
app.set('trust proxy', 1);

// Headers de seguranca HTTP (CSP default, XFO, HSTS, etc).
app.use(helmet());

// CORS: em prod exigir origem explicita (lista separada por virgula).
// Em dev (CORS_ORIGIN vazio) libera geral pra facilitar testes locais.
const allowedOrigins = env.CORS_ORIGIN
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: false,
  }),
);

app.use(express.json({ limit: '10mb' }));

// Rate-limit em /api/* (janela 1 min, 300 req/IP).
// Acomoda Evolution reencaminhando bursts do WhatsApp + N8N (a cada 15 min)
// + painel do nutricionista, e ainda barra flood se atacante forjar segredos
// e tentar spammar. Excluida /health porque healthcheck do Railway pinga muito.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

app.use('/health', healthRouter);
app.use('/api', apiLimiter, apiRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(env.PORT, () => {
  console.log(`[nutrichat-backend] Rodando na porta ${env.PORT} (${env.NODE_ENV})`);
});

process.on('SIGTERM', () => {
  console.log('[nutrichat-backend] SIGTERM recebido, encerrando...');
  server.close(() => process.exit(0));
});

export { app, server };
