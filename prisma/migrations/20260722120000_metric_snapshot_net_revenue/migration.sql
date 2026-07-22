-- Receita líquida canônica de e-commerce (diretriz Marcos 2026-07-22).
-- ADITIVA: só adiciona colunas nullable; nenhum dado existente é alterado ou removido.
-- netRevenue  = receita LÍQUIDA do dia (Nuvemshop: Σ (total - frete) de pedidos PAGOS).
-- newCustomers = clientes novos (1ª compra) no dia (GA4Sync kpis / Nuvemshop first-time buyer).
ALTER TABLE "MetricSnapshot" ADD COLUMN "netRevenue" DECIMAL(12,2);
ALTER TABLE "MetricSnapshot" ADD COLUMN "newCustomers" INTEGER;
