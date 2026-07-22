import { z } from 'zod';

export const RenderModeSchema = z.enum(['static', 'js']);
export const EscalationSchema = z.enum(['off', 'auto', 'max']);
export const FormModeSchema = z.enum(['keep', 'replace', 'capture_redirect', 'disable']);
export const BundleFormatSchema = z.enum(['html', 'zip']);
export const CloneStatusSchema = z.enum([
  'queued',
  'rendering',
  'sanitizing',
  'resolving_assets',
  'ready',
  'failed',
]);
export const BuildStatusSchema = z.enum(['queued', 'building', 'ready', 'failed']);

export const ViewportSchema = z.object({
  width: z.number().int().min(320).max(3840),
  height: z.number().int().min(320).max(2160),
});

export const LinkReplacementSchema = z.object({
  from: z.string().url(),
  to: z.string().url(),
});

export const CloneOptionsSchema = z
  .object({
    renderMode: RenderModeSchema.default('js'),
    inlineAssets: z.boolean().default(false),
    userAgent: z.string().max(500).optional(),
    viewport: ViewportSchema.optional(),
    escalation: EscalationSchema.default('auto'),
    webhookUrl: z.string().url().optional(),
    linkReplacements: z.array(LinkReplacementSchema).max(100).optional(),
    keepScriptSrcs: z.array(z.string()).max(50).optional(),
  })
  .strict();

export const InspectRequestSchema = z.object({ url: z.string().url() }).strict();

export const CreateVslJobRequestSchema = z.object({ url: z.string().url() }).strict();
export const VslJobStatusSchema = z.enum([
  'queued',
  'analyzing',
  'extracting',
  'downloading',
  'processing',
  'uploading',
  'ready',
  'failed',
]);

export const CreateCloneRequestSchema = z
  .object({
    url: z.string().url(),
    options: CloneOptionsSchema.optional(),
  })
  .strict();

export const FormFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  value: z.string().optional(),
  hidden: z.boolean(),
  required: z.boolean(),
});

export const FormSchema = z.object({
  id: z.string(),
  selector: z.string(),
  originalAction: z.string(),
  currentAction: z.string(),
  method: z.enum(['GET', 'POST']),
  mode: FormModeSchema,
  redirectTo: z.string().url().optional(),
  fields: z.array(FormFieldSchema),
});

export const UpdateFormRequestSchema = z
  .object({
    mode: FormModeSchema.optional(),
    currentAction: z.string().optional(),
    redirectTo: z.string().url().optional(),
  })
  .strict();

export const LinkSchema = z.object({
  id: z.string(),
  selector: z.string(),
  originalHref: z.string(),
  currentHref: z.string(),
  text: z.string(),
  rel: z.string().optional(),
  isExternal: z.boolean(),
  isCta: z.boolean(),
});

export const UpdateLinkRequestSchema = z
  .object({
    currentHref: z.string(),
  })
  .strict();

export const BulkLinkUpdateSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    isRegex: z.boolean().default(false),
  })
  .strict();

export const BuildOptionsSchema = z
  .object({
    format: BundleFormatSchema,
    inlineAssets: z.boolean().default(false),
    applyEdits: z.boolean().default(true),
  })
  .strict();

export const ProblemSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type CreateCloneRequest = z.infer<typeof CreateCloneRequestSchema>;
export type UpdateFormRequest = z.infer<typeof UpdateFormRequestSchema>;
export type UpdateLinkRequest = z.infer<typeof UpdateLinkRequestSchema>;
export type BulkLinkUpdate = z.infer<typeof BulkLinkUpdateSchema>;
export type BuildOptionsRequest = z.infer<typeof BuildOptionsSchema>;
export type Problem = z.infer<typeof ProblemSchema>;
export type InspectRequest = z.infer<typeof InspectRequestSchema>;

export const CreateFunnelJobRequestSchema = z
  .object({
    url: z.string().url(),
    max_depth: z.number().int().min(1).max(8).default(4),
    max_pages: z.number().int().min(1).max(30).default(20),
  })
  .strict();

export const OfferStatusSchema = z.enum(['testando', 'validando', 'escala', 'pausado', 'morrendo']);

export const CreateOfferRequestSchema = z
  .object({
    name: z.string().min(1).max(60),
    company_name: z.string().trim().min(1).max(80).optional(),
    dashboard_id: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
    status: OfferStatusSchema.optional(),
    utmify_login: z.string().trim().min(1).max(200).optional(),
    utmify_password: z.string().min(1).max(500).optional(),
    member_ids: z.array(z.string().min(1).max(64)).max(100).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasConnection = Boolean(
      value.dashboard_id || value.utmify_login || value.utmify_password,
    );
    if (!hasConnection) return;
    for (const field of ['dashboard_id', 'utmify_login', 'utmify_password'] as const) {
      if (!value[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'Obrigatório para conectar a UTMify.',
        });
      }
    }
  });

export const UpdateOfferRequestSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    company_name: z.string().trim().min(1).max(80).optional(),
    dashboard_id: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
    status: OfferStatusSchema.optional(),
    utmify_login: z.string().trim().min(1).max(200).optional(),
    utmify_password: z.string().min(1).max(500).optional(),
    member_ids: z.array(z.string().min(1).max(64)).max(100).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Boolean(value.utmify_login) !== Boolean(value.utmify_password)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [value.utmify_login ? 'utmify_password' : 'utmify_login'],
        message: 'Informe login e senha juntos.',
      });
    }
  });

const AdsetSnapshotSchema = z.object({
  name: z.string(),
  spend: z.number().nonnegative().default(0),
  sales: z.number().int().nonnegative().default(0),
  revenue: z.number().nonnegative().default(0),
  ic: z.number().int().nonnegative().default(0),
  impressions: z.number().int().nonnegative().optional(),
  clicks: z.number().int().nonnegative().optional(),
});

const DailySnapshotInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  spend: z.number().nonnegative().default(0),
  sales: z.number().int().nonnegative().default(0),
  revenue: z.number().nonnegative().default(0),
  ic: z.number().int().nonnegative().default(0),
  impressions: z.number().int().nonnegative().optional(),
  clicks: z.number().int().nonnegative().optional(),
  adsets: z.array(AdsetSnapshotSchema).max(500).optional(),
  ads: z
    .array(
      AdsetSnapshotSchema.extend({
        hookRate: z.number().nonnegative().optional(),
        ctr: z.number().nonnegative().optional(),
      }),
    )
    .max(5000)
    .optional(),
});

export const IngestSnapshotsRequestSchema = z
  .object({
    snapshots: z.array(DailySnapshotInputSchema).min(1).max(60),
  })
  .strict();

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
    niche_id: z.string().min(1).max(64),
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
    if (value.phase_cancel && !value.niche_id) {
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
