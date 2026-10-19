import { createHash } from 'node:crypto';
import { z } from 'zod';

export const SettingsSchema = z.object({
  checkout_url: z.string().url().max(4096).optional().or(z.literal('')),
  sender_name: z.string().trim().min(2).max(80).default('TMX'),
  quiet_start: z.coerce.number().int().min(0).max(23).default(21),
  quiet_end: z.coerce.number().int().min(0).max(23).default(8),
  enabled: z.boolean().default(true),
});

export const EmailSenderSchema = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .refine((value) => {
    if (z.string().email().safeParse(value).success) return true;
    const named = value.match(/^[^<>\r\n]{1,100}\s*<([^<>\r\n]+)>$/);
    return Boolean(named?.[1] && z.string().email().safeParse(named[1].trim()).success);
  }, 'Use email@dominio.com ou Nome <email@dominio.com>.');

export const ChannelSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('whatsapp'),
    enabled: z.boolean().default(true),
    credentials: z.object({ access_token: z.string().min(20), phone_number_id: z.string().min(5) }),
    config: z.object({ template_name: z.string().min(1), language: z.string().default('pt_BR') }),
  }),
  z.object({
    kind: z.literal('sms'),
    enabled: z.boolean().default(true),
    credentials: z.object({
      account_sid: z.string().min(10),
      auth_token: z.string().min(10),
      from_number: z.string().min(6),
    }),
    config: z.object({ message: z.string().min(10).max(1000) }),
  }),
  z.object({
    kind: z.literal('email'),
    enabled: z.boolean().default(true),
    credentials: z
      .object({ api_key: z.string().min(10).optional(), from_email: EmailSenderSchema.optional() })
      .optional()
      .default({}),
    config: z.object({
      subject: z
        .string()
        .min(3, 'O assunto precisa ter pelo menos 3 caracteres.')
        .max(200, 'O assunto pode ter no máximo 200 caracteres.'),
      message: z
        .string()
        .min(10, 'O HTML precisa ter pelo menos 10 caracteres.')
        .max(100_000, 'O HTML pode ter no máximo 100.000 caracteres.'),
    }),
  }),
]);

export const SendSchema = z.object({ channel: z.enum(['whatsapp', 'sms', 'email']) });

export const TestEmailSchema = z.object({
  to: z.string().trim().email().max(320),
  subject: z.string().trim().min(3).max(200),
  message: z.string().min(10).max(100_000),
});

export const BulkSendSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'email']),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export const mask = (value: string | null, kind: 'email' | 'phone') => {
  if (!value) return null;
  if (kind === 'email') {
    const [name, domain] = value.split('@');
    return `${name?.slice(0, 2) ?? ''}***@${domain ?? ''}`;
  }
  return `***${value.replace(/\D/g, '').slice(-4)}`;
};

export const appendAttribution = (destination: string, source: Record<string, string>) => {
  const url = new URL(destination);
  for (const [key, value] of Object.entries(source ?? {})) {
    if (
      value &&
      /^(utm_(source|medium|campaign|content|term)|campaign_id|campaign_name|adset_id|adset_name|ad_id|ad_name|placement|site_source_name|fbclid|gclid|src|sck)$/.test(
        key,
      ) &&
      !url.searchParams.has(key)
    ) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
};

export const renderRecoveryEmail = (
  message: string,
  name: string,
  link: string,
  openUrl: string,
) => {
  const rendered = message
    .replaceAll('{{nome}}', name)
    .replaceAll('href="{{link}}"', `href="${link}"`)
    .replaceAll("href='{{link}}'", `href='${link}'`)
    .replaceAll('{{link}}', `<a href="${link}">Retomar compra</a>`);
  const pixel = `<img src="${openUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;opacity:0;overflow:hidden" />`;
  return rendered.includes('</body>')
    ? rendered.replace('</body>', `${pixel}</body>`)
    : `${rendered}${pixel}`;
};
