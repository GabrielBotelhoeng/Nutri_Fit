---
phase: 3
plan: "03-01"
title: "audio.ts — transcrição Groq Whisper"
status: complete
completed_at: "2026-04-25T00:00:00Z"
tasks_completed: 1
tasks_total: 1

provides:
  - "audio.ts: downloadMedia, transcreverAudio, processarAudio"
  - "webhook.ts: case audioMessage conectado a audioService.processarAudio"
  - "groq-sdk instalado no container"

key-files:
  created:
    - backend/src/services/audio.ts
  modified:
    - backend/src/routes/webhook.ts
    - backend/package.json

decisions:
  - "mimetype.split(';')[0].trim() para limpar 'audio/ogg; codecs=opus' do WhatsApp"
  - "downloadMedia exportado para reutilização em vision.ts"
  - "groq.audio.transcriptions.create com language=pt e response_format=text"

deviations: []
self-check: PASSED
---

## Summary

`audio.ts` criado com transcrição Groq Whisper e `webhook.ts` atualizado.

Paciente envia áudio → `downloadMedia` baixa da Evolution API → `transcreverAudio` envia ao Groq Whisper → texto vai para `processarTextoRefeicao` de meal.ts.
