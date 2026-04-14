-- Add Customer Success role to Role enum
-- PostgreSQL requires ALTER TYPE outside a transaction block
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CS';
