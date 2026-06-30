-- CSX-13: alerta de anti-churn proativo. Aditivo e idempotente.

ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'ANTICHURN_ACTION_NEEDED';
