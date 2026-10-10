const cache = new Map<string, {expires:number;value:{compatible:boolean;reason:string;url?:string}}>();
export function buildSyzepayRecoveryUrl(destination:string, sessionId:string, stepId?:string) {
  const url=new URL(destination);
  if(url.protocol!=='https:') throw Error('Use HTTPS para SyzePay.');
  url.searchParams.delete('vendaId'); url.searchParams.delete('force');
  url.searchParams.set('s',sessionId); if(stepId)url.searchParams.set('step',stepId);
  return url.toString();
}
export async function validateSyzepayRecovery(destination:string,sessionId:string) {
  const key=`${destination}:${sessionId}`,cached=cache.get(key);
  if(cached && cached.expires>Date.now())return cached.value;
  let value:{compatible:boolean;reason:string;url?:string};
  try {
    const r=await fetch(`https://syzehub.com/api/checkout/sessions/${encodeURIComponent(sessionId)}`,{signal:AbortSignal.timeout(5000)});
    const s=await r.json() as {mode?:string;status?:string;funnelSteps?:Array<{id:string;behavior?:{external_page_enabled?:boolean;external_page_url?:string}}>};
    const target=new URL(destination);
    const matches=(s.funnelSteps??[]).filter(step=>{
      if(!step.behavior?.external_page_enabled || !step.behavior.external_page_url)return false;
      const page=new URL(step.behavior.external_page_url);
      return page.origin===target.origin && page.pathname.replace(/\/$/,'')===target.pathname.replace(/\/$/,'');
    });
    value=r.ok && s.mode==='live' && s.status==='completed' && matches.length===1
      ? {compatible:true,reason:'syzepay_session_verified',url:buildSyzepayRecoveryUrl(destination,sessionId,matches[0]!.id)}
      : {compatible:false,reason:'Sessão ou página não reconhecida no funil SyzePay.'};
  } catch {value={compatible:false,reason:'Consulta da sessão SyzePay indisponível.'};}
  if(cache.size>=500)cache.clear();cache.set(key,{expires:Date.now()+30000,value});return value;
}
