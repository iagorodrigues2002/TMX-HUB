// Read-only production receipt: aggregate classifications, never print buyers or credentials.
const { createHmac } = require('node:crypto');
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
(async () => {
  try {
    const sub = '01KQSEXEWXZ9Y67V2HFK18JHJB';
    const [email, role] = await redis.hmget('user:' + sub, 'email', 'role');
    if (!email || role !== 'admin') throw Error('Authorized actor unavailable');
    const enc = v => Buffer.from(JSON.stringify(v)).toString('base64url');
    const iat = Math.floor(Date.now() / 1000);
    const prefix = enc({alg:'HS256',typ:'JWT'}) + '.' + enc({sub,email,role,iat,exp:iat+120});
    const token = prefix + '.' + createHmac('sha256',process.env.JWT_SECRET).update(prefix).digest('base64url');
    const query = new URLSearchParams({from:'2026-11-19',to:'2026-11-19',company_id:'69706e9a-95ad-493e-b4ab-4a6de7541adc'});
    const response = await fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/v1/tracking/refunds-dashboard?'+query,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error('Refund API HTTP '+response.status);
    const result = await response.json();
    const counts = {natural:0,assisted:0,unknown:0};
    for (const row of result.items) {
      if (!Object.hasOwn(counts,row.origin)) throw Error('Missing or invalid origin');
      counts[row.origin]++;
    }
    console.log(JSON.stringify({http:response.status,items:result.items.length,counts,allOriginsPresent:true}));
  } finally { await redis.quit(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
