import { createHash } from 'node:crypto';

export type MetaTestEventName = 'InitiateCheckout' | 'Purchase';

export function buildMetaTestEvent(args: {
  eventName: MetaTestEventName;
  eventId: string;
  eventSourceUrl: string;
  externalId: string;
  clientIp?: string;
  userAgent?: string;
  now?: Date;
}) {
  const userData: Record<string, string | string[]> = {
    external_id: [
      createHash('sha256').update(args.externalId.trim().toLowerCase()).digest('hex'),
    ],
  };
  if (args.clientIp) userData.client_ip_address = args.clientIp;
  if (args.userAgent) userData.client_user_agent = args.userAgent;
  return {
    event_name: args.eventName,
    event_time: Math.floor((args.now ?? new Date()).getTime() / 1000),
    event_id: args.eventId,
    action_source: 'website' as const,
    event_source_url: args.eventSourceUrl,
    user_data: userData,
    custom_data:
      args.eventName === 'Purchase'
        ? {
            value: 1,
            currency: 'BRL',
            order_id: `tmx-test-${args.eventId}`,
            content_name: 'Evento de teste TMX',
          }
        : {
            value: 1,
            currency: 'BRL',
            content_name: 'Checkout de teste TMX',
          },
  };
}
