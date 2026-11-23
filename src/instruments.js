import { marketData } from './instruments-data.js';
export { marketData };
export const categoryNames={currency:'Валюты',metal:'Металлы',energy:'Энергоносители',crypto:'Криптовалюты',index:'Индексы',cfd:'Акции CFD'};
export const accountNames={'mt4-real-ecn':'MT4 Real ECN','mt4-real-std':'MT4 Real Standard'};
export const catalog=(account='mt4-real-ecn')=>marketData.accounts[account]??marketData.accounts['mt4-real-ecn'];
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
  const price=side==='BUY'?spec.bid:spec.ask;
  return { symbol:spec.symbol,quote:spec.profitCurrency,contract:spec.contract,price,entry:price,lots:spec.lotMin,tick:spec.point,conversion:conversionRate(spec.profitCurrency,currency,account),marginConversion:conversionRate(spec.marginCurrency,currency,account),marginMode:'broker',spec:{...spec,accountType:account,capturedAt:marketData.capturedAt} };
}
export function specMarginLabel(spec) {
  if(spec.marginMode===0)return `FX · контракт / плечо / ${spec.marginDivider}`;
  if(spec.marginMode===1)return `CFD · номинал / ${spec.marginDivider}`;
  return 'Проверьте модель';
}
