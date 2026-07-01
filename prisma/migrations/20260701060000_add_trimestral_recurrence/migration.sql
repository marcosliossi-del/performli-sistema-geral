-- Adiciona valor TRIMESTRAL ao enum RecurrenceFrequency (NPS trimestral, ciclo 90 dias).
-- Migração ADITIVA e IDEMPOTENTE. ADD VALUE não pode rodar dentro de bloco DO/transação,
-- por isso usa a forma direta com IF NOT EXISTS.
ALTER TYPE "RecurrenceFrequency" ADD VALUE IF NOT EXISTS 'TRIMESTRAL';
