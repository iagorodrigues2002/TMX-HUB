import { z } from 'zod';

// ---- Video Shield ----

export const ShieldCompressionSchema = z.enum(['none', 'lossless', 'balanced', 'small']);

export const CreateNicheRequestSchema = z
  .object({
    name: z.string().min(1).max(60),
    description: z.string().max(500).optional(),
  })
  .strict();

export const UpdateNicheRequestSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    description: z.string().max(500).optional(),
  })
  .strict();

export const CreateShieldJobBodySchema = z
  .object({
    niche_id: z.string().min(1).max(64).optional(),
    use_white_audio: z.boolean().optional(),
    white_volume_db: z.number().min(-40).max(-5).optional(),
    compression: ShieldCompressionSchema.optional(),
    verify_transcript: z.boolean().optional(),
  })
  .strict();

// ---- Creative Studio ----

export const MediaCompressionSchema = z.enum(['none', 'balanced', 'small']);
export const MediaAspectRatioSchema = z.enum(['original', '9:16', '4:5', '1:1']);
export const MediaExtensionModeSchema = z.enum(['none', 'loop', 'freeze']);

export const CreateMediaJobBodySchema = z
  .object({
    compression: MediaCompressionSchema.optional(),
    aspect_ratio: MediaAspectRatioSchema.optional(),
    strip_metadata: z.boolean().optional(),
    normalize_audio: z.boolean().optional(),
    extension_mode: MediaExtensionModeSchema.optional(),
    target_seconds: z.number().int().min(1).max(3600).optional(),
    phase_cancel: z.boolean().optional(),
    use_white_audio: z.boolean().optional(),
    niche_id: z.string().min(1).max(64).optional(),
    white_volume_db: z.number().min(-40).max(-5).optional(),
    verify_transcript: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.extension_mode !== undefined &&
      value.extension_mode !== 'none' &&
      !value.target_seconds
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target_seconds'],
        message: 'target_seconds é obrigatório quando a extensão está ativa.',
      });
    }
    if (value.phase_cancel && value.use_white_audio !== false && !value.niche_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['niche_id'],
        message: 'niche_id é obrigatório quando Phase Cancel está ativo.',
      });
    }
  });

// ---- Digistore24 Audit ----

export const DigiAuditStatusSchema = z.enum([
  'draft',
  'in_review',
  'approved',
  'rejected',
  'abandoned',
]);

export const DigiItemStateSchema = z.enum(['pending', 'done', 'na']);

export const DigiAuditItemSchema = z.object({
  state: DigiItemStateSchema,
  notes: z.string().max(1000).optional(),
  url: z.string().max(500).optional(),
});

export const CreateDigiAuditRequestSchema = z
  .object({
    product_name: z.string().min(1).max(80),
    offer_id: z.string().max(64).optional(),
  })
  .strict();

export const UpdateDigiAuditRequestSchema = z
  .object({
    product_name: z.string().min(1).max(80).optional(),
    offer_id: z.string().max(64).optional(),
    status: DigiAuditStatusSchema.optional(),
    notes: z.string().max(5000).optional(),
    items: z.record(z.string(), DigiAuditItemSchema).optional(),
  })
  .strict();
