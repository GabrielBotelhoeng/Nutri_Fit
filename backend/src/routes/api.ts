import { Router } from 'express';
import { webhookRouter } from './webhook';
import { ragRouter } from './rag';
import { boasVindasRouter } from './boas-vindas';
import { alertasRouter } from './alertas';
import { expiracaoRouter } from './expiracao';
import { relatorioRouter } from './relatorio';
import { aguaRouter } from './agua';
import { pacientesRouter } from './pacientes';

export const apiRouter = Router();

apiRouter.use('/webhook', webhookRouter);
apiRouter.use('/rag', ragRouter);
apiRouter.use('/boas-vindas', boasVindasRouter);
apiRouter.use('/alertas', alertasRouter);
apiRouter.use('/expiracao', expiracaoRouter);
apiRouter.use('/relatorio', relatorioRouter);
apiRouter.use('/agua', aguaRouter);
apiRouter.use('/pacientes', pacientesRouter);
