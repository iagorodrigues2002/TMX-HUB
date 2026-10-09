import type { Sql } from 'postgres';
import { ulid } from 'ulid';
import { buildTikTokPixelScript } from './tracker-script.js';

export type OfferCartConfig = {
  project_id: string; public_key: string; product_id: string; product_name: string;
  amount_minor: number; currency: string; checkout_test_id: string; pixel_codes: string[];
};
export type OfferBasket = {
  id: string; event_id: string; product_id: string; product_name: string;
  amount_minor: number; currency: string; quantity: number;
};
export type CartAddInput = {
  config: OfferCartConfig; cartId: string; visitorId: string; sessionId?: string; journeyId?: string;
  source: Record<string,string>; eventUrl: string; ip: string; userAgent: string;
};
export interface OfferCartStore {
  config(key: string): Promise<OfferCartConfig | null>;
  basket(project: string, id: string): Promise<OfferBasket | null>;
  add(input: CartAddInput): Promise<{basket: OfferBasket; created: boolean; deliveryIds: string[]}>;
}
export function cartProperties(b: OfferBasket) {
  return { content_id: b.product_id, content_type: 'product', content_name: b.product_name,
    quantity: b.quantity, value: b.amount_minor / 100, currency: b.currency,
    contents: [{content_id:b.product_id,content_name:b.product_name,content_type:'product',quantity:b.quantity,price:b.amount_minor/100}] };
}
export function postgresCartStore(db: Sql): OfferCartStore {
  return {
    async config(key) {
      const [row] = await db<OfferCartConfig[]>`
        SELECT c.*,p.public_key,ARRAY(SELECT pixel_code FROM tracking_tiktok_destinations d
          WHERE d.project_id=p.id AND d.enabled=true ORDER BY d.id) pixel_codes
        FROM tracking_cart_configs c JOIN tracking_projects p ON p.id=c.project_id
        JOIN tracking_ab_tests t ON t.id=c.checkout_test_id AND t.project_id=p.id
        WHERE p.public_key=${key} AND p.enabled=true AND c.enabled=true
          AND t.status='active' AND t.deleted_at IS NULL`;
      return row ?? null;
    },
    async basket(project, id) {
      const [row] = await db<OfferBasket[]>`SELECT * FROM tracking_cart_baskets WHERE project_id=${project} AND id=${id}`;
      return row ?? null;
    },
    async add(input) {
      const c = input.config;
      return db.begin(async tx => {
        const eventId = ulid();
        const [added] = await tx<OfferBasket[]>`
          INSERT INTO tracking_cart_baskets(project_id,id,visitor_id,product_id,product_name,amount_minor,currency,event_id)
          VALUES(${c.project_id},${input.cartId},${input.visitorId},${c.product_id},${c.product_name},${c.amount_minor},${c.currency},${eventId})
          ON CONFLICT(project_id,id) DO NOTHING RETURNING *`;
        if (!added) {
          const [existing] = await tx<OfferBasket[]>`SELECT * FROM tracking_cart_baskets WHERE project_id=${c.project_id} AND id=${input.cartId}`;
          if (!existing) throw new Error('Cart not persisted');
          return {basket:existing,created:false,deliveryIds:[]};
        }
        await tx`
          INSERT INTO tracking_events(id,project_id,visitor_id,session_id,journey_id,event_name,event_category,event_url,source,properties,client_ip,user_agent)
          VALUES(${eventId},${c.project_id},${input.visitorId},${input.sessionId??null},${input.journeyId??null},'AddToCart','commerce',${input.eventUrl},
            ${tx.json(input.source as never)},${tx.json({...cartProperties(added),cart_id:input.cartId} as never)},${input.ip},${input.userAgent})`;
        const destinations = await tx<{id:string}[]>`SELECT id FROM tracking_tiktok_destinations WHERE project_id=${c.project_id} AND enabled=true`;
        const ids: string[] = [];
        for (const dest of destinations) {
          const id = ulid();
          await tx`INSERT INTO tracking_tiktok_deliveries(id,project_id,destination_id,event_id,event_name)
            VALUES(${id},${c.project_id},${dest.id},${eventId},'AddToCart')`;
          ids.push(id);
        }
        return {basket:added,created:true,deliveryIds:ids};
      });
    },
  };
}

const htmlEscape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function renderOfferCart(c: OfferCartConfig) {
  const data = JSON.stringify({key:c.public_key,pixels:c.pixel_codes}).replace(/</g,'\\u003c');
  const money = new Intl.NumberFormat('en-US',{style:'currency',currency:c.currency}).format(c.amount_minor/100);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Shopping cart · TMX</title>
<style>:root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif;background:#08181f;color:#f3fafc}*{box-sizing:border-box}body{margin:0}header{max-width:980px;margin:auto;padding:30px 24px;border-bottom:1px solid #31515d}header strong{font-size:24px}main{max-width:980px;margin:56px auto;padding:0 24px;display:grid;grid-template-columns:1fr 1fr;gap:48px}h1{font-size:36px;line-height:1.15;margin:0 0 20px}h2{font-size:22px;margin:0 0 24px}p{line-height:1.6;color:#97abb4;max-width:55ch}.price{font-size:28px;color:#f3fafc}button,a.checkout{display:inline-block;padding:15px 24px;border:0;border-radius:8px;background:#23cbd5;color:#08181f;font:600 16px system-ui;text-decoration:none;cursor:pointer}button:disabled{cursor:default;background:#31515d;color:#f3fafc}button:focus-visible,a:focus-visible{outline:3px solid white;outline-offset:4px}aside{background:#102630;padding:28px;border-radius:12px;align-self:start}.line{display:flex;justify-content:space-between;gap:20px;margin:20px 0}.total{border-top:1px solid #31515d;padding-top:22px;font-size:24px}#message{min-height:48px}#cart-item{font-weight:500}.checkout{width:100%;text-align:center;margin-top:12px}[hidden]{display:none!important}small{display:block;color:#97abb4;margin-top:20px;line-height:1.5}footer{max-width:980px;margin:auto;padding:24px;color:#97abb4}@media(max-width:680px){main{grid-template-columns:1fr;gap:28px;margin:32px auto}h1{font-size:30px}}</style></head>
<body><header><strong>TMX cart</strong></header><main><section><h1>${htmlEscape(c.product_name)}</h1><p class="price">${htmlEscape(money)}</p><p>Add this product to your cart, then continue to the existing secure checkout. Adding a product does not charge you.</p><button id="add" disabled>Add to cart</button><p id="message" role="status" aria-live="polite">Loading your cart…</p></section><aside aria-label="Shopping cart"><h2>Your cart</h2><p id="empty">Your cart is empty.</p><div id="item" hidden><div id="cart-item">${htmlEscape(c.product_name)}</div><div class="line"><span>Quantity</span><span>1</span></div><div class="line"><span>Price</span><span>${htmlEscape(money)}</span></div></div><div class="line total"><span>Total</span><strong id="total">${htmlEscape(new Intl.NumberFormat('en-US',{style:'currency',currency:c.currency}).format(0))}</strong></div><a id="checkout" class="checkout" href="/v1/link/${encodeURIComponent(c.checkout_test_id)}" hidden>Continue to secure checkout</a><small>Payment happens only at checkout. This optional page does not change the original offer entry link.</small></aside></main><footer>TMX · Shopping cart</footer>
<script src="/v1/track/t.js?key=${encodeURIComponent(c.public_key)}"></script>
<script>${buildTikTokPixelScript(c.pixel_codes)}</script>
<script>(()=>{const C=${data},root='/v1/track/cart/'+encodeURIComponent(C.key),btn=document.getElementById('add'),msg=document.getElementById('message');let id;
const show=()=>{document.getElementById('empty').hidden=true;document.getElementById('item').hidden=false;document.getElementById('checkout').hidden=false;document.getElementById('total').textContent=${JSON.stringify(money)};btn.disabled=true;btn.textContent='Added to cart';msg.textContent='Product added. No payment has been made.'};
const source=()=>{let out={};for(const k of ['_tmx_first','_tmx_last'])try{Object.assign(out,JSON.parse(localStorage.getItem(k)||'{}'))}catch{}for(const[k,v]of new URL(location.href).searchParams)if(/^(utm_|ttclid|ttp|campaign_|adset_|ad_|placement)/.test(k))out[k]=v;const ttp=document.cookie.split('; ').find(x=>x.startsWith('_ttp='));if(ttp)out._ttp=decodeURIComponent(ttp.slice(5));return Object.fromEntries(Object.entries(out).filter(([,v])=>typeof v==='string').slice(0,60))};
btn.addEventListener('click',async()=>{btn.disabled=true;msg.textContent='Adding product…';try{const visitor=localStorage.getItem('_tmx_v');if(!visitor)throw Error('Tracking not loaded. Reload this page and try again.');const response=await fetch(root+'/items',{method:'POST',credentials:'omit',headers:{'content-type':'application/json'},body:JSON.stringify({cart_id:id,visitor_id:visitor,session_id:sessionStorage.getItem('_tmx_s')||undefined,journey_id:localStorage.getItem('_tmx_j')||undefined,source:source()})});if(!response.ok)throw Error('Could not add the product. Please try again.');const result=await response.json();show();if(result.created&&window.ttq)for(const p of C.pixels)try{window.ttq.instance(p).track('AddToCart',result.properties,{event_id:result.basket.event_id})}catch{}}catch(e){msg.textContent=e.message||'Please try again.';btn.disabled=false}});
(async()=>{try{const key='_tmx_cart_'+C.key;id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id)}const r=await fetch(root+'/items/'+encodeURIComponent(id),{credentials:'omit'});if(!r.ok)throw Error('Could not load your cart. Reload to try again.');const result=await r.json();if(result.basket)show();else{btn.disabled=false;msg.textContent='No items added yet.'}}catch(e){msg.textContent=e.message||'Browser storage is required for this cart.'}})();})();</script></body></html>`;
}
