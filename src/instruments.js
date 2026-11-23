import { marketData } from './instruments-data.js';
export { marketData };
export const categoryNames={currency:'Валюты',metal:'Металлы',energy:'Энергоносители',crypto:'Криптовалюты',index:'Индексы',cfd:'Акции CFD'};
export const profiles=marketData.profiles;
export const accountNames=Object.fromEntries(Object.entries(profiles).map(([id,p])=>[id,p.label]));
export const catalog=(account='mt4-real-ecn')=>marketData.accounts[account]??[];
export const profileInfo=account=>profiles[account]??null;
export const findInstrument=(symbol,account)=>catalog(account).find(p=>p.symbol===symbol);
export function conversionRate(from,to,account='mt4-real-ecn') {
  if(from===to)return 1;
  const edges=new Map();
  const edge=(a,b,rate)=>{if(!edges.has(a))edges.set(a,[]);edges.get(a).push([b,rate]);};
  for(const p of catalog(account))if(p.category==='currency'&&p.bid>0&&p.ask>0){const price=(p.bid+p.ask)/2;edge(p.base,p.profitCurrency,price);edge(p.profitCurrency,p.base,1/price);}
  const queue=[[from,1]],seen=new Set([from]);
  for(let i=0;i<queue.length;i++)for(const [currency,rate] of edges.get(queue[i][0])??[]){if(currency===to)return queue[i][1]*rate;if(!seen.has(currency)){seen.add(currency);queue.push([currency,queue[i][1]*rate]);}}
  return NaN;
}
export function instrumentSettings(spec,currency,account,side='BUY') {
  const quoted=side==='BUY'?spec.bid:spec.ask;
  const price=spec.quoteAvailable&&Number.isFinite(quoted)&&quoted>0?quoted:NaN;
  return { symbol:spec.symbol,quote:spec.profitCurrency,contract:spec.contract,price,entry:price,lots:spec.lotMin,tick:spec.point,conversion:conversionRate(spec.profitCurrency,currency,account),marginConversion:conversionRate(spec.marginCurrency,currency,account),marginMode:'broker',spec:{...spec,accountType:account,group:profiles[account]?.group??null,platform:profiles[account]?.platform??null,capturedAt:profiles[account]?.capturedAt??marketData.capturedAt} };
}
export function groupApplicationPlan(positions,profile,currency){
  if(!profiles[profile])throw Error('Неизвестная группа или профиль.');
  return positions.map(p=>{
    const original=p.spec?.originalSymbol||p.symbol;
    const match=catalog(profile).find(s=>s.symbol===p.symbol)||catalog(profile).find(s=>(s.originalSymbol||s.symbol)===original);
    if(!match)return {id:p.id,from:p.symbol,to:null,position:p,error:'Инструмент отсутствует в выбранной группе'};
    const settings=instrumentSettings(match,currency,profile,p.side);
    // Group changes alter specifications, never the operator's positions or marked prices.
    const next={...p,...settings,price:p.price,entry:p.entry,lots:p.lots};
    const changes=[];
    for(const [key,label] of [['contract','контракт'],['quote','валюта P&L'],['tick','шаг цены']])if(p[key]!==next[key])changes.push(`${label}: ${p[key]} → ${next[key]}`);
    if(p.spec?.marginDivider!==match.marginDivider)changes.push(`делитель маржи: ${p.spec?.marginDivider??'—'} → ${match.marginDivider}`);
    if(p.spec?.accountType!==profile)changes.push('новая групповая спецификация');
    return {id:p.id,from:p.symbol,to:next.symbol,position:next,changes};
  });
}
export function specMarginLabel(spec) {
  if(spec.marginMode===0)return `FX · контракт / плечо / ${spec.marginDivider}`;
  if(spec.marginMode===1)return `CFD · номинал / ${spec.marginDivider}`;
  return 'Проверьте модель';
}
