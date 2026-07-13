-- Módulo Conversas (CRM conversacional — WhatsApp Cloud API por cliente).
-- Migration 100% ADITIVA: cria novos enums + novas tabelas com FKs para Client
-- (cascade) e adiciona UMA coluna nullable em "Task". Nenhuma tabela existente é
-- alterada de forma destrutiva; nada é removido; enums existentes são reusados
-- (AutomationLogStatus em "ConversationAutomationRun").

-- CreateEnum
CREATE TYPE "ConversationChannelType" AS ENUM ('WHATSAPP_CLOUD', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "ConversationChannelStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "ConversationOptIn" AS ENUM ('UNKNOWN', 'OPTED_IN', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "ConversationLeadStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "ConversationMessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'TEMPLATE', 'INTERACTIVE', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "ChannelEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "ConversationTriggerType" AS ENUM ('LEAD_CREATED', 'STAGE_CHANGED', 'MESSAGE_RECEIVED', 'NO_REPLY_AFTER', 'TAG_ADDED');

-- CreateEnum
CREATE TYPE "BotSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'HANDED_OFF', 'ABORTED');

-- CreateEnum
CREATE TYPE "TemplateMetaStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'DONE', 'FAILED');

-- AlterTable (aditivo: coluna nullable, sem default destrutivo)
ALTER TABLE "Task" ADD COLUMN "conversationLeadId" TEXT;

-- CreateTable
CREATE TABLE "ConversationChannel" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "ConversationChannelType" NOT NULL,
    "status" "ConversationChannelStatus" NOT NULL DEFAULT 'PENDING',
    "phoneNumberId" TEXT,
    "wabaId" TEXT,
    "displayName" TEXT,
    "credentials" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "instagramHandle" TEXT,
    "customFields" JSONB,
    "optInStatus" "ConversationOptIn" NOT NULL DEFAULT 'UNKNOWN',
    "optInAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationPipeline" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ConversationPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationStage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "color" TEXT,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "isConversion" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ConversationStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationLead" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "value" DECIMAL(12,2),
    "source" TEXT,
    "utm" JSONB,
    "ctwaClid" TEXT,
    "referral" JSONB,
    "status" "ConversationLeadStatus" NOT NULL DEFAULT 'OPEN',
    "lostReason" TEXT,
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "leadId" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "assignedUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" "ConversationMessageType" NOT NULL,
    "body" TEXT,
    "mediaUrl" TEXT,
    "waMessageId" TEXT,
    "status" "MessageDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "errorDetail" TEXT,
    "sentByUserId" TEXT,
    "sentByBot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelEvent" (
    "id" TEXT NOT NULL,
    "channelId" TEXT,
    "externalId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "ChannelEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ChannelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationAutomation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" "ConversationTriggerType" NOT NULL,
    "triggerConfig" JSONB,
    "actions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConversationAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationAutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "leadId" TEXT,
    "status" "AutomationLogStatus" NOT NULL,
    "error" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotFlow" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "channelIds" TEXT[],

    CONSTRAINT "BotFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSession" (
    "id" TEXT NOT NULL,
    "botFlowId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "currentNode" TEXT NOT NULL,
    "variables" JSONB,
    "status" "BotSessionStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "BotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationTemplate" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "metaTemplateName" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'pt_BR',
    "body" TEXT NOT NULL,
    "variables" TEXT[],
    "metaStatus" "TemplateMetaStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ConversationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationBroadcast" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "audienceFilter" JSONB NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConversationBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "value" DECIMAL(12,2),
    "currency" TEXT DEFAULT 'BRL',
    "eventId" TEXT NOT NULL,
    "sentToMeta" BOOLEAN NOT NULL DEFAULT false,
    "metaTraceId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationNote" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationChannel_clientId_type_phoneNumberId_key" ON "ConversationChannel"("clientId", "type", "phoneNumberId");

-- CreateIndex
CREATE INDEX "ConversationChannel_clientId_idx" ON "ConversationChannel"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationContact_clientId_phone_key" ON "ConversationContact"("clientId", "phone");

-- CreateIndex
CREATE INDEX "ConversationContact_clientId_createdAt_idx" ON "ConversationContact"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationPipeline_clientId_idx" ON "ConversationPipeline"("clientId");

-- CreateIndex
CREATE INDEX "ConversationStage_pipelineId_order_idx" ON "ConversationStage"("pipelineId", "order");

-- CreateIndex
CREATE INDEX "ConversationLead_clientId_pipelineId_stageId_idx" ON "ConversationLead"("clientId", "pipelineId", "stageId");

-- CreateIndex
CREATE INDEX "ConversationLead_clientId_status_idx" ON "ConversationLead"("clientId", "status");

-- CreateIndex
CREATE INDEX "Conversation_clientId_lastMessageAt_idx" ON "Conversation"("clientId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_clientId_status_assignedUserId_idx" ON "Conversation"("clientId", "status", "assignedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMessage_waMessageId_key" ON "ConversationMessage"("waMessageId");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelEvent_externalId_key" ON "ChannelEvent"("externalId");

-- CreateIndex
CREATE INDEX "ChannelEvent_status_receivedAt_idx" ON "ChannelEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "ConversationAutomation_clientId_triggerType_isActive_idx" ON "ConversationAutomation"("clientId", "triggerType", "isActive");

-- CreateIndex
CREATE INDEX "ConversationAutomationRun_automationId_executedAt_idx" ON "ConversationAutomationRun"("automationId", "executedAt");

-- CreateIndex
CREATE INDEX "BotFlow_clientId_isActive_idx" ON "BotFlow"("clientId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BotSession_conversationId_botFlowId_key" ON "BotSession"("conversationId", "botFlowId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTemplate_clientId_channelId_metaTemplateName_lan_key" ON "ConversationTemplate"("clientId", "channelId", "metaTemplateName", "language");

-- CreateIndex
CREATE INDEX "ConversationBroadcast_clientId_status_idx" ON "ConversationBroadcast"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionEvent_eventId_key" ON "ConversionEvent"("eventId");

-- CreateIndex
CREATE INDEX "ConversionEvent_clientId_sentToMeta_idx" ON "ConversionEvent"("clientId", "sentToMeta");

-- CreateIndex
CREATE INDEX "ConversationNote_leadId_createdAt_idx" ON "ConversationNote"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConversationChannel" ADD CONSTRAINT "ConversationChannel_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationContact" ADD CONSTRAINT "ConversationContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationPipeline" ADD CONSTRAINT "ConversationPipeline_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationStage" ADD CONSTRAINT "ConversationStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "ConversationPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationLead" ADD CONSTRAINT "ConversationLead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationLead" ADD CONSTRAINT "ConversationLead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ConversationContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ConversationContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ConversationChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAutomation" ADD CONSTRAINT "ConversationAutomation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAutomationRun" ADD CONSTRAINT "ConversationAutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "ConversationAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotFlow" ADD CONSTRAINT "BotFlow_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSession" ADD CONSTRAINT "BotSession_botFlowId_fkey" FOREIGN KEY ("botFlowId") REFERENCES "BotFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTemplate" ADD CONSTRAINT "ConversationTemplate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationBroadcast" ADD CONSTRAINT "ConversationBroadcast_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
