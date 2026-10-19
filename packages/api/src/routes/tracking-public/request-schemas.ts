import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

export const EventSchema = z.object({
  public_key: z.string().min(16).max(128),
  event_id: z.string().min(8).max(128),
  visitor_id: z.string().min(8).max(128),
  session_id: z.string().min(8).max(128).optional(),
  journey_id: z.string().min(8).max(128).optional(),
  event_name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/),
  event_category: z.string().trim().min(1).max(40).default('behavior'),
  event_url: z.string().url().max(4096),
  page_title: z.string().max(512).optional(),
  referrer: z.string().url().max(4096).optional().or(z.literal('')),
  source: z.record(z.string(), z.string().max(2048)).default({}),
  properties: z.record(z.string(), z.unknown()).default({}),
  consent_state: z.enum(['granted', 'denied', 'unknown']).optional(),
  client_at: z.string().datetime().optional(),
});

export const BootstrapSchema = z.object({
  public_key: z.string().min(16).max(128),
  visitor_id: z.string().min(8).max(128),
  session_id: z.string().min(8).max(128),
  journey_id: z.string().min(8).max(128),
  landing_url: z.string().url().max(4096),
  referrer: z.string().url().max(4096).optional().or(z.literal('')),
  source: z.record(z.string(), z.string().max(2048)).default({}),
  tracking_token: z.string().max(2048).optional(),
});

export const ConsentRecordSchema = z.object({
  public_key: z.string().min(16).max(128),
  visitor_id: z.string().min(8).max(128),
  consent: z.enum(['granted', 'denied']),
  version: z.string().trim().min(1).max(64),
  purposes: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(40)
        .regex(/^[a-z][a-z0-9_-]*$/),
    )
    .max(16)
    .default([]),
  client_at: z.string().datetime().optional(),
});

export const AbAssignmentSchema = z.object({
  public_key: z.string().min(8).max(120),
  visitor_id: z.string().min(8).max(120),
});

export const UpsellEventSchema = z.object({
  public_key: z.string().min(8).max(120),
  stage_key: z.string().regex(/^upsell_[1-9][0-9]*$/),
  token: z.string().max(4096).optional(),
  visitor_id: z.string().min(8).max(128),
  journey_id: z.string().min(8).max(128),
  event_name: z.enum([
    'UpsellPageView',
    'UpsellOfferView',
    'UpsellAcceptClick',
    'UpsellDeclineClick',
    'UpsellExit',
    'UpsellPageError',
    'UpsellScroll',
  ]),
  event_url: z.string().url().max(4096),
  source: z.record(z.string(), z.string().max(2048)).default({}),
  properties: z.record(z.string(), z.unknown()).default({}),
  vendid: z.string().trim().min(1).max(1024).optional(),
  client_at: z.string().datetime().optional(),
});

export type AbRedirectRequest = FastifyRequest<{
  Params: { testId: string };
  Querystring: Record<string, string | undefined>;
}>;

export type EntryRedirectRequest = FastifyRequest<{
  Params: { slug: string };
  Querystring: Record<string, string | undefined>;
}>;
