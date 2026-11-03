import { ALL_TOOL_KEYS } from '@page-cloner/shared';
import { z } from 'zod';
import { request } from './request.js';

export const companyRole = z.enum(['owner', 'admin', 'member']);
export const companyMemberSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  role: companyRole,
  platform_role: z.enum(['admin', 'user']).nullable().optional(),
  status: z.enum(['active', 'suspended']),
  tools: z.array(
    z.string().refine((value) => (ALL_TOOL_KEYS as readonly string[]).includes(value)),
  ),
  all_offers: z.boolean(),
  offer_ids: z.array(z.string()),
});
export const companiesSchema = z.object({
  companies: z.array(z.object({ id: z.string(), name: z.string(), role: companyRole })),
});
export type Company = z.infer<typeof companiesSchema>['companies'][number];
export type CompanyMember = z.infer<typeof companyMemberSchema>;
export type MemberAccess = Pick<
  CompanyMember,
  'role' | 'status' | 'tools' | 'all_offers' | 'offer_ids'
>;
const path = (id: string) => `/v1/companies/${encodeURIComponent(id)}`;
export const companyApi = {
  async list() {
    return companiesSchema.parse(await request('/v1/companies'));
  },
  async create(name: string) {
    return request('/v1/companies', { method: 'POST', body: { name } });
  },
  async members(id: string) {
    return z
      .object({ members: z.array(companyMemberSchema) })
      .parse(await request(`${path(id)}/members`));
  },
  async offers(id: string) {
    return z
      .object({ offers: z.array(z.object({ id: z.string(), name: z.string() })) })
      .parse(await request(`${path(id)}/offers`));
  },
  async save(id: string, userId: string, access: MemberAccess) {
    return request(`${path(id)}/members/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: access,
    });
  },
  async add(id: string, email: string) {
    return request(`${path(id)}/members`, {
      method: 'POST',
      body: { email, role: 'member', tools: [], all_offers: false, offer_ids: [] },
    });
  },
};
