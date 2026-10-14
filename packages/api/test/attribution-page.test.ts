import {describe,it,expect,vi} from 'vitest';
vi.mock('../src/env.js',()=>({env:{}}));
import {attributionPage} from '../src/services/attribution-page.js';
describe('campaign attribution advertiser page',()=>{
  const saved={platform:'meta',adId:'ad',campaignId:'campaign',adAccountId:'account',pageName:'Advertiser Page',pageId:'123'};
  it('uses explicit journey metadata or exact saved ad/campaign identity',()=>{
    expect(attributionPage({ad_id:'ad',campaign_id:'campaign'},[saved])).toEqual({page_name:'Advertiser Page',page_id:'123'});
    expect(attributionPage({page_metadata:[{page_name:'Direct',page_id:'456'}]},[saved])).toEqual({page_name:'Direct',page_id:'456'});
  });
  it('never guesses from campaign name, missing IDs, different campaign or account',()=>{
    expect(attributionPage({campaign_name:'campaign'},[saved]).page_name).toBeNull();
    expect(attributionPage({ad_id:'ad',campaign_id:'other'},[saved]).page_name).toBeNull();
    expect(attributionPage({ad_id:'ad',source:'FB'},[saved,{...saved,adAccountId:'other'}]).page_name).toBeNull();
    expect(attributionPage({ad_id:'ad',campaign_id:'campaign',source:'google'},[saved]).page_name).toBeNull();
  });
  it('keeps differing page identities/names ambiguous and ignores page metrics',()=>{
    expect(attributionPage({ad_id:'ad',source:'FB'},[saved,{...saved,pageId:'456'}]).page_name).toBeNull();
    expect(attributionPage({page_metadata:[{page_name:'One'},{page_name:'Two'}]},[saved]).page_name).toBeNull();
    expect(attributionPage({ad_id:'ad'},[{...saved,pageName:undefined,pageId:undefined,landingPageViews:20}]).page_name).toBeNull();
  });
});
