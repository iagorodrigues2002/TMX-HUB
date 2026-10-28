import type { FastifyInstance } from 'fastify';

export interface SaleNoticeRow {
  id: string;
  status: string;
  provider: string;
  amount_minor: string | null;
  currency: string | null;
  occurred_at: Date;
  offer_id: string;
}

type Offer = { id: string; name: string };
type Subscriber = {
  since: number;
  cursor: number;
  seen: Map<string, number>;
  offers: Offer[];
  checkedAt: number;
  authorize: () => Promise<Offer[]>;
  send: (message: object) => void;
  close: () => void;
};

// One database scan per API instance, not one polling clock per browser.
export class SaleNoticeFeed {
  private clients = new Set<Subscriber>();
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;

  constructor(private app: Pick<FastifyInstance, 'db' | 'log'>) {}

  subscribe(client: Omit<Subscriber, 'cursor' | 'seen' | 'checkedAt'>) {
    const entry: Subscriber = {
      ...client,
      cursor: client.since,
      seen: new Map(),
      checkedAt: Date.now(),
    };
    this.clients.add(entry);
    if (!this.timer) {
      this.timer = setInterval(() => void this.tick(), 1000);
      this.timer.unref();
    }
    return () => {
      this.clients.delete(entry);
      if (!this.clients.size) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    };
  }

  close() {
    clearInterval(this.timer);
    this.timer = undefined;
    for (const client of this.clients) client.close();
    this.clients.clear();
  }

  async tick() {
    if (this.busy || !this.clients.size || !this.app.db) return;
    this.busy = true;
    try {
      const now = Date.now();
      const clients = [...this.clients];
      for (const client of clients) {
        if (now - client.checkedAt < 15_000) continue;
        try {
          client.offers = await client.authorize();
          client.checkedAt = now;
          client.send({
            type: 'heartbeat',
            at: new Date(now),
            offer_ids: client.offers.map((o) => o.id),
          });
        } catch {
          client.close();
          this.clients.delete(client);
        }
      }
      const active = clients.filter((client) => this.clients.has(client));
      const ids = [...new Set(active.flatMap((client) => client.offers.map((offer) => offer.id)))];
      if (!ids.length) return;
      // Overlap catches transactions committed after a previous scan; IDs dedupe replays.
      let since = new Date(
        Math.max(now - 86_400_000, Math.min(...active.map((c) => c.cursor)) - 60_000),
      );
      let after = '';
      while (active.some((client) => this.clients.has(client))) {
        const rows: SaleNoticeRow[] = await this.app.db<SaleNoticeRow[]>`
          SELECT o.id,o.status,o.provider,o.amount_minor,o.currency,o.occurred_at,p.offer_id
          FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
          WHERE p.offer_id=ANY(${ids}) AND o.status='paid'
            AND (o.occurred_at>${since} OR (o.occurred_at=${since} AND o.id>${after}))
            AND o.occurred_at<=${new Date(now)}
          ORDER BY o.occurred_at,o.id LIMIT 200
        `;
        if (!rows.length) break;
        // Recheck all recipients before broadcasting, not just when the stream opens.
        const deliveries = await Promise.all(
          active.map(async (client) => {
            if (!this.clients.has(client)) return;
            const unseen = rows.filter(
              (row) => +new Date(row.occurred_at) >= client.since && !client.seen.has(row.id),
            );
            if (!unseen.length) return;
            try {
              client.offers = await client.authorize();
              client.checkedAt = now;
              const names = new Map(client.offers.map((offer) => [offer.id, offer.name]));
              const items = unseen
                .filter((row) => names.has(row.offer_id))
                .map((row) => ({
                  ...row,
                  offerId: row.offer_id,
                  offerName: names.get(row.offer_id),
                }));
              for (const row of unseen) client.seen.set(row.id, +new Date(row.occurred_at));
              client.cursor = Math.max(
                client.cursor,
                ...rows.map((row) => +new Date(row.occurred_at)),
              );
              for (const [id, time] of client.seen)
                if (time < client.cursor - 60_000) client.seen.delete(id);
              return {
                client,
                message: {
                  type: 'sales',
                  at: new Date(now),
                  cursor: new Date(client.cursor),
                  items,
                  offer_ids: client.offers.map((offer) => offer.id),
                },
              };
            } catch {
              client.close();
              this.clients.delete(client);
            }
          }),
        );
        // Flush the same batch together, after every recipient's access check finishes.
        for (const delivery of deliveries)
          if (delivery && this.clients.has(delivery.client)) delivery.client.send(delivery.message);
        if (rows.length < 200) break;
        const last = rows.at(-1)!;
        since = new Date(last.occurred_at);
        after = last.id;
      }
    } catch (err) {
      this.app.log.warn({ err }, 'sale notice feed unavailable');
      // Reconnects resume from the last received cursor, never a client clock.
      this.close();
    } finally {
      this.busy = false;
    }
  }
}
