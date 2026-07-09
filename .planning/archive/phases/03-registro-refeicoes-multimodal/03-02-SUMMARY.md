---
phase: 3
plan: "03-02"
title: "vision.ts + barcode.ts — Claude Vision e Open Food Facts"
status: complete
completed_at: "2026-04-25T00:00:00Z"
tasks_completed: 2
tasks_total: 2

provides:
  - "vision.ts: processarImagem com detecção automática de tipo (prato/barcode/rótulo)"
  - "barcode.ts: extrairCodigoViaVision + buscarOpenFoodFacts + processarCodigoBarras"
  - "agent.ts: interceptação de confirmacao_pendente antes do bloco ehRegistro"
  - "webhook.ts: case imageMessage conectado a visionService.processarImagem"
  - "conversation.ts: index signature [key: string]: unknown no tipo dados"

key-files:
  created:
    - backend/src/services/vision.ts
    - backend/src/services/barcode.ts
  modified:
    - backend/src/routes/webhook.ts
    - backend/src/services/agent.ts
    - backend/src/services/conversation.ts

decisions:
  - "Index signature adicionado a EstadoEntrevista.dados para campos dinâmicos JSONB"
  - "D-04: timeout expirado processa foto1 com aviso em vez de descartar"
  - "D-06: confirmacao_pendente interceptado em agent.ts antes do bloco ehRegistro"
  - "barcode: fallback para lerRotulo quando Open Food Facts não encontra o produto"

deviations: []
self-check: PASSED
---

## Summary

`vision.ts` e `barcode.ts` criados. Stub `imageMessage` substituído no webhook.

Fluxo prato: detecta tipo → solicita 2ª foto → analisa com Claude Vision → confirmação "sim"/"não" → registra.  
Fluxo barcode: extrai código via Vision → busca Open Food Facts → registra automaticamente.  
Fluxo rótulo: lê tabela nutricional via Vision → registra automaticamente.
