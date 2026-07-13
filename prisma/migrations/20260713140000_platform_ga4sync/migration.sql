-- Adiciona valor GA4SYNC ao enum Platform (persistência da receita real do GA4Sync
-- no MetricSnapshot, para clientes com loja Nuvemshop conectada).
-- Migração ADITIVA e IDEMPOTENTE. ADD VALUE não pode rodar dentro de bloco DO/transação,
-- por isso usa a forma direta com IF NOT EXISTS.
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'GA4SYNC';
