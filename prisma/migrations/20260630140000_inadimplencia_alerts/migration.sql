-- FIN-19: alertas de inadimplência (contas a receber). 100% aditivo e idempotente.

ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'INVOICE_OVERDUE';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'CLIENT_WITHOUT_BILLING';
