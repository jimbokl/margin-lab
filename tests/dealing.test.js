import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,position,analyze,criticalPrices,validate} from '../src/engine.js';
import {catalog,findInstrument,instrumentSettings,conversionRate} from '../src/instruments.js';
import {parseCsv,csvTemplate} from '../src/csv.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function fixed(){const s=demo();s.account.marginSource='terminal';s.account.usedMargin=1000;s.positions=[position({price:1.2,entry:1.2,tick:.00001})];return s;}
test('Used Margin overrides all per-position margins, without adding other margin twice',()=>{
  const s=fixed();s.account.otherMargin=500;const r=analyze(s);near(r.current.margin,1000);near(r.stressed.margin,1000);near(r.current.level,1000);near(r.current.free,9000);
});
test('binary search BUY gives tick-accurate MC and SO prices',()=>{
  const s=fixed(),r=criticalPrices(s)[0];near(r.callDown.price,1.11);near(r.stopDown.price,1.102);assert.equal(r.callUp.kind,'unreachable');
});
test('binary search SELL searches upward and preserves a mixed portfolio net exposure',()=>{
  const s=fixed();s.positions[0].side='SELL';const r=criticalPrices(s)[0];near(r.callUp.price,1.29);near(r.stopUp.price,1.298);assert.equal(r.stopDown.kind,'unreachable');
  s.positions.push(position({lots:.5,price:1.2,entry:1.2}));near(criticalPrices(s)[0].callUp.price,1.38);
});
test('each symbol moves independently, even with profitable other positions',()=>{
  const s=fixed();s.positions.push(position({symbol:'GOLD',lots:1,contract:100,price:2500,entry:2000,tick:.01}));
  const rows=criticalPrices(s);near(rows.find(x=>x.symbol==='EURUSD').callDown.price,1.11);near(rows.find(x=>x.symbol==='GOLD').callDown.price,2410);
});
test('hedged fixed-margin P&L has no critical price; range limits remain explicit',()=>{
  const s=fixed();s.positions.push(position({side:'SELL',price:1.2,entry:1.2}));const r=criticalPrices(s)[0];assert.equal(r.stopDown.kind,'unreachable');assert.equal(r.stopUp.kind,'unreachable');
  s.positions.pop();assert.equal(criticalPrices(s,1,1)[0].stopDown.kind,'unreachable');
});
test('binary search handles breached levels and zero margin',()=>{
  const s=fixed();s.account.capital=100;assert.equal(criticalPrices(s)[0].stopDown.kind,'breached');s.account.usedMargin=0;assert.equal(criticalPrices(s)[0].stopDown.kind,'no-margin');
});
test('swap and commission included once from balance, ignored in already supplied Equity',()=>{
  const s=fixed();s.account.mode='balance';s.positions[0].entry=1.19;s.positions[0].swap=-15;s.positions[0].commission=-5;
  near(analyze(s).current.equity,10980);s.account.mode='equity';near(analyze(s).current.equity,10000);
});
test('manual money-per-price handles nonstandard linear sensitivities for the whole position',()=>{
  const s=fixed();Object.assign(s.positions[0],{pnlMode:'custom',moneyPerPrice:25000});near(criticalPrices(s)[0].callDown.price,.84);near(analyze(s).stressed.pnlChange,-900);
});
test('all catalog entries have usable current specifications and reconcile to source modes',()=>{
  for(const profile of ['mt4-real-ecn','mt4-real-std']){
    assert.equal(catalog(profile).length,134);
    for(const spec of catalog(profile)){
      const s=demo();s.positions=[position(instrumentSettings(spec,'USD',profile))];const r=analyze(s);assert.deepEqual(r.errors,[],spec.symbol);
      const p=s.positions[0];const fx=spec.marginCurrency==='USD'?1:spec.marginMode===0?spec.bid*p.conversion:conversionRate(spec.marginCurrency,'USD',profile);
      const expected=spec.marginMode===0?p.lots*p.contract/p.leverage/spec.marginDivider*fx:p.lots*p.contract*p.price/spec.marginDivider*fx;
      near(r.current.margin,expected,1e-5);
    }
  }
});
test('CFD margin divider takes precedence over account leverage',()=>{
  const s=demo();s.positions=[position({...instrumentSettings(findInstrument('XAUUSD'),'USD','mt4-real-ecn'),lots:1,price:2500})];
  near(analyze(s).current.margin,1250);s.positions[0].leverage=1000;near(analyze(s).current.margin,1250);
});
test('Forex margin in account base currency remains fixed',()=>{
  const s=demo();s.account.currency='EUR';s.positions=[position(instrumentSettings(findInstrument('EURUSD'),'EUR','mt4-real-ecn'))];
  const r=analyze(s);near(r.current.margin,10);near(r.stressed.margin,10);
});
test('larger side and hedged factor both respect the chosen accounting policy',()=>{
  const s=demo(),spec=findInstrument('EURUSD');
  const settings=instrumentSettings(spec,'USD','mt4-real-ecn');s.positions=[position({...settings,lots:2}),position({...settings,side:'SELL',lots:1})];
  const gross=analyze(s).current.margin;s.account.marginPolicy='larger';near(analyze(s).current.margin,gross*2/3);
  s.account.marginPolicy='hedged';near(analyze(s).current.margin,gross/3);
  s.positions[1].beta=2;assert.ok(validate(s).length);
});
test('money thresholds are independently supported by the engine',()=>{
  const s=fixed();s.account.thresholdUnit='money';s.account.marginCall=2000;s.account.stopOut=500;near(criticalPrices(s)[0].callDown.price,1.12);near(criticalPrices(s)[0].stopDown.price,1.105);
});
test('CSV parses quoted names and decimal comma; invalid files do not become zeros',()=>{
  const ps=parseCsv(csvTemplate);assert.equal(ps.length,3);near(ps[1].swap,3);
  const quoted='symbol;side;lots;entry;price;contract;quote;conversion\n"MY;ASSET";BUY;"0,1";1;2;100;USD;1';near(parseCsv(quoted)[0].lots,.1);
  assert.throws(()=>parseCsv('symbol;side\nEURUSD;BUY'));
  assert.throws(()=>parseCsv(csvTemplate.replace('1;1.08',';1.08')));
  assert.throws(()=>parseCsv(csvTemplate+'"unterminated'));
});
