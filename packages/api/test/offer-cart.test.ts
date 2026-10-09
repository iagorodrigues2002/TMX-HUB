import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import cartRoutes from '../src/routes/offer-cart.js';
import { renderOfferCart, type OfferCartConfig, type OfferCartStore } from '../src/services/offer-cart.js';

const config: OfferCartConfig = { project_id: 'project-a', public_key: 'public-key-cart-a-123', product_id: '169476832', product_name: 'Real product', amount_minor: 1700, currency: 'USD', checkout_test_id: 'test-a', pixel_codes: ['PIXEL-A','PIXEL-B'] };
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(a => a.close())); });
function fixture() {
  const baskets = new Map<string, any>();
  const deliveries: string[] = [];
  const store: OfferCartStore = {
    config: async key => key === config.public_key ? config : null,
    basket: async (project, id) => baskets.get(project + ':' + id) ?? null,
    add: async input => {
      const key = input.config.project_id + ':' + input.cartId;
      const previous = baskets.get(key);
      if (previous) return { basket: previous, created: false, deliveryIds: [] };
      const basket = { id: input.cartId, event_id: 'actual-event-id-123', product_id: config.product_id, product_name: config.product_name, amount_minor: config.amount_minor, currency: config.currency, quantity: 1 };
      baskets.set(key, basket);
      deliveries.push('a','b');
      return { basket, created: true, deliveryIds: ['a','b'] };
    },
  };
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const app = Fastify(); apps.push(app);
  app.register(cartRoutes, { store, enqueue });
  return { app, deliveries, enqueue };
}
const input = { cart_id: 'ba7eaac2-48b0-4cbe-a3c2-0fdfde322874', visitor_id: 'visitor-cart-123', source: {} };

describe('optional offer cart', () => {
  it('starts empty, only adds on POST and cannot leak another project', async () => {
    const { app, deliveries } = fixture();
    const url = '/track/cart/' + config.public_key;
    expect((await app.inject({url})).statusCode).toBe(200);
    expect(deliveries).toHaveLength(0);
    expect((await app.inject({url: url + '/items/' + input.cart_id})).json().basket).toBeNull();
    expect((await app.inject({url: '/track/cart/other-public-key-123/items/' + input.cart_id})).statusCode).toBe(404);
  });
  it('creates one basket/event and queues twice only on the first click', async () => {
    const { app, enqueue, deliveries } = fixture();
    const req = {method: 'POST' as const, url: '/track/cart/' + config.public_key + '/items', payload: input};
    const first = await app.inject(req);
    const again = await app.inject(req);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({created:true,properties:{content_id:'169476832',value:17,currency:'USD'}});
    expect(again.json().created).toBe(false);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(deliveries).toHaveLength(2);
    expect((await app.inject({url:req.url + '/' + input.cart_id})).json().basket.quantity).toBe(1);
  });
  it('rejects price manipulation and malformed basket IDs', async () => {
    const { app } = fixture();
    for (const payload of [{...input, amount_minor:1}, {...input, cart_id:'not-a-uuid'}, {...input, product_id:'other'}]) {
      expect((await app.inject({method:'POST',url:'/track/cart/'+config.public_key+'/items',payload})).statusCode).toBe(400);
    }
  });
  it('keeps a persisted basket accepted if Redis is temporarily unavailable', async () => {
    const { app, enqueue } = fixture(); enqueue.mockRejectedValue(new Error('Redis down'));
    expect((await app.inject({method:'POST',url:'/track/cart/'+config.public_key+'/items',payload:input})).statusCode).toBe(201);
  });
  it('escapes product text and never embeds secrets or a Purchase event', () => {
    const html = renderOfferCart({...config,product_name:'</script><img src=x onerror=alert(1)>'});
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('access-token');
    expect(html).not.toContain("track('Purchase'");
    expect(html).toContain("track('AddToCart'");
    expect(html).toContain('/v1/link/test-a');
  });
});
