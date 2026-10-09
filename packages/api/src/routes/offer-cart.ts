import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { cartProperties, postgresCartStore, renderOfferCart, type OfferCartStore } from '../services/offer-cart.js';

const Add = z.object({cart_id:z.string().uuid(),visitor_id:z.string().min(8).max(128),session_id:z.string().min(8).max(128).optional(),journey_id:z.string().min(8).max(128).optional(),source:z.record(z.string().max(80),z.string().max(2048)).default({})}).strict();
type Options = {store?:OfferCartStore;enqueue?:(id:string)=>Promise<unknown>};
const plugin: FastifyPluginAsync<Options> = async (app, options) => {
  const store = options.store ?? (app.db ? postgresCartStore(app.db) : null);
  const enqueue = options.enqueue ?? ((id:string) => app.tiktokQueue.add('send',{deliveryId:id},{jobId:'tiktok-cart-'+id}));
  const config = (key:string) => store?.config(key) ?? Promise.resolve(null);
  app.get<{Params:{key:string}}>('/track/cart/:key', async (req,reply) => {
    const c=await config(req.params.key);if(!c)return reply.code(404).send({error:'Cart unavailable'});
    return reply.header('cache-control','no-store').header('x-content-type-options','nosniff')
      .header('content-security-policy',"object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
      .type('text/html; charset=utf-8').send(renderOfferCart(c));
  });
  app.get<{Params:{key:string;cartId:string}}>('/track/cart/:key/items/:cartId',async(req,reply)=>{
    const c=await config(req.params.key);if(!c)return reply.code(404).send({error:'Cart unavailable'});
    if(!z.string().uuid().safeParse(req.params.cartId).success)return reply.code(400).send({error:'Invalid cart'});
    return reply.header('cache-control','no-store').send({basket:await store!.basket(c.project_id,req.params.cartId)});
  });
  app.post<{Params:{key:string}}>('/track/cart/:key/items',{bodyLimit:32*1024,config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async(req,reply)=>{
    const c=await config(req.params.key);if(!c)return reply.code(404).send({error:'Cart unavailable'});
    const parsed=Add.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Invalid cart input'});
    const b=parsed.data;
    const result=await store!.add({config:c,cartId:b.cart_id,visitorId:b.visitor_id,sessionId:b.session_id,journeyId:b.journey_id,source:b.source,
      eventUrl:env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/,'')+'/v1/track/cart/'+encodeURIComponent(c.public_key),ip:req.ip,userAgent:req.headers['user-agent']??''});
    // The durable outbox is committed first. Existing recovery retries Redis failures.
    await Promise.allSettled(result.deliveryIds.map(id=>enqueue(id)));
    return reply.code(result.created?201:200).header('cache-control','no-store')
      .send({basket:result.basket,created:result.created,properties:cartProperties(result.basket)});
  });
};
export default plugin;
