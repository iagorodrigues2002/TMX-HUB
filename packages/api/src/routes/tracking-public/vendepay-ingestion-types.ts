import type { FastifyRequest } from 'fastify';
import type { TransactionSql } from 'postgres';
import type { normalizeVendepayWebhook } from '../../integrations/vendepay/explodely-compat.js';
export type VendepayConnection = {
  id: string;
  project_id: string;
  token_hash: string;
  offer_id: string;
  name: string;
  payload_adapter: 'vendepay' | 'explodely';
  signing_secret_encrypted: string | null;
};
export type VendepayIngestion = {
  normalized: Extract<ReturnType<typeof normalizeVendepayWebhook>, { kind: 'processable' }>;
  req: FastifyRequest;
  connection: VendepayConnection;
  receiptId: string;
  ingestBrlMinor: number | null;
  ingestExchangeRate: number | null;
  ingestConvertedAt: Date | null;
};
export type VendepayTransaction = VendepayIngestion & { sql: TransactionSql };
