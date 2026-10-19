import type { FastifyInstance } from 'fastify';

export function createGetDestinationConnectionContext(app: FastifyInstance) {
  async function getDestinationConnection(offerId: string, destinationId: string, userId: string) {
    if (!app.db) return null;
    const [row] = await app.db<
      {
        id: string;
        project_id: string;
        customer_id: string;
        conversion_action_id: string;
        refresh_token_encrypted: string | null;
        granted_scope: string | null;
      }[]
    >`
      SELECT d.id, d.project_id, d.customer_id, d.conversion_action_id,
             c.refresh_token_encrypted, c.granted_scope
      FROM tracking_google_ads_destinations d
      JOIN tracking_projects p ON p.id=d.project_id
      LEFT JOIN tracking_google_ads_oauth_connections c ON c.id=d.oauth_connection_id
        AND c.user_id=${userId} AND (c.offer_id IS NULL OR c.offer_id=${offerId})
      WHERE p.offer_id=${offerId} AND d.id=${destinationId} AND d.state='draft'
    `;
    return row ?? null;
  }
  return { getDestinationConnection };
}
