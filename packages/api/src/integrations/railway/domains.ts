import { env } from '../../env.js';

export interface RailwayDnsRecord {
  hostlabel: string;
  requiredValue: string;
}

export interface RailwayDomainProvision {
  id: string;
  verificationToken?: string;
  verificationDnsHost?: string;
  dnsRecords: RailwayDnsRecord[];
}

export async function provisionRailwayDomain(
  hostname: string,
): Promise<RailwayDomainProvision | null> {
  if (!env.RAILWAY_PROJECT_TOKEN) return null;
  const response = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Project-Access-Token': env.RAILWAY_PROJECT_TOKEN,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation customDomainCreate($input: CustomDomainCreateInput!) {
        customDomainCreate(input: $input) {
          id
          status {
            verificationToken
            verificationDnsHost
            dnsRecords { hostlabel requiredValue }
          }
        }
      }`,
      variables: {
        input: {
          projectId: env.RAILWAY_PROJECT_ID,
          environmentId: env.RAILWAY_ENVIRONMENT_ID,
          serviceId: env.RAILWAY_API_SERVICE_ID,
          domain: hostname,
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Railway respondeu HTTP ${response.status}.`);
  const payload = (await response.json()) as {
    data?: { customDomainCreate?: { id: string; status?: RailwayDomainProvision } };
    errors?: Array<{ message?: string }>;
  };
  const created = payload.data?.customDomainCreate;
  if (!created) {
    throw new Error(payload.errors?.[0]?.message || 'Railway não provisionou o domínio.');
  }
  return {
    id: created.id,
    verificationToken: created.status?.verificationToken,
    verificationDnsHost: created.status?.verificationDnsHost,
    dnsRecords: [
      ...(created.status?.dnsRecords ?? []),
      ...(created.status?.verificationToken && created.status.verificationDnsHost
        ? [
            {
              hostlabel: created.status.verificationDnsHost,
              requiredValue: created.status.verificationToken,
            },
          ]
        : []),
    ],
  };
}

export async function deleteRailwayDomain(domainId: string): Promise<void> {
  if (!env.RAILWAY_PROJECT_TOKEN) return;
  const response = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Project-Access-Token': env.RAILWAY_PROJECT_TOKEN,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation customDomainDelete($id: String!) {
        customDomainDelete(id: $id)
      }`,
      variables: { id: domainId },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Railway respondeu HTTP ${response.status}.`);
  const payload = (await response.json()) as { errors?: Array<{ message?: string }> };
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'Railway não removeu o domínio.');
  }
}
