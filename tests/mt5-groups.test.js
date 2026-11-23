import test from 'node:test';
import assert from 'node:assert/strict';
import {profiles,catalog,findInstrument,instrumentSettings,groupApplicationPlan} from '../src/instruments.js';
import {demo,position,analyze,validate} from '../src/engine.js';
const mt5=Object.entries(profiles).filter(([,p])=>p.platform==='MT5');
test('six confirmed MT5 USD groups contain independent effective specifications',()=>{
  assert.equal(mt5.length,6);assert.equal(new Set(mt5.map(([,p])=>p.group)).size,6);
  for(const [id,p] of mt5){assert.equal(catalog(id).length,161);assert.equal(p.currency,'USD');assert.match(p.group,/^REAL\\B-USD-(ECN|STD|CNT)-(DEF|SWF)-X$/);assert.equal(p.thresholds,null);}
  assert.equal(catalog('unknown-group').length,0);
});
test('MT5 Standard and Cent use exact suffixed symbols supplied by the API',()=>{
  assert.ok(findInstrument('EURUSD','mt5-real-ecn'));
  assert.ok(findInstrument('EURUSD.s','mt5-real-std'));
  assert.ok(findInstrument('EURUSD.c','mt5-real-cnt'));
  assert.equal(findInstrument('EURUSD','mt5-real-std'),undefined);
});
test('group application maps original symbols and preserves trade and account inputs',()=>{
  const p=position({...instrumentSettings(findInstrument('EURUSD','mt4-real-ecn'),'USD','mt4-real-ecn'),lots:1.27,price:1.2,entry:1.19,side:'SELL',swap:-11,commission:-3,beta:2,leverage:500});
  const plan=groupApplicationPlan([p],'mt5-real-std','USD');const next=plan[0].position;
  assert.equal(next.symbol,'EURUSD.s');assert.equal(next.spec.group,'REAL\\B-USD-STD-DEF-X');
  for(const k of ['id','lots','price','entry','side','swap','commission','beta','leverage'])assert.equal(next[k],p[k],k);
  const cent=groupApplicationPlan([next],'mt5-real-cnt-sf','USD')[0].position;
  assert.equal(cent.symbol,'EURUSD.c');assert.equal(cent.spec.group,'REAL\\B-USD-CNT-SWF-X');
});
test('MT5 gold divisor differs from MT4 and changes calculated margin',()=>{
  const s=demo();s.positions=[position({...instrumentSettings(findInstrument('XAUUSD','mt4-real-ecn'),'USD','mt4-real-ecn'),price:3000,entry:3000,lots:1})];
  const before=analyze(s).current.margin;assert.equal(before,1500);
  s.positions=groupApplicationPlan(s.positions,'mt5-real-ecn','USD').map(p=>p.position);
  assert.equal(s.positions[0].spec.marginDivider,500);assert.equal(analyze(s).current.margin,600);
  s.account.marginSource='terminal';s.account.usedMargin=1234;assert.equal(analyze(s).current.margin,1234);
});
test('missing groups and symbols never silently fall back to MT4',()=>{
  assert.throws(()=>groupApplicationPlan([position()],'made-up','USD'));
  const row=groupApplicationPlan([position({symbol:'CUSTOM'})],'mt5-real-ecn','USD')[0];assert.ok(row.error);assert.equal(row.to,null);
});
test('unknown MT5 hedged margin is not treated as a zero discount',()=>{
  const s=demo();s.positions=[position(instrumentSettings(findInstrument('EURUSD','mt5-real-ecn'),'USD','mt5-real-ecn'))];
  s.account.marginPolicy='hedged';assert.ok(validate(s).some(e=>e.includes('Hedged Margin')));
  s.account.marginSource='terminal';s.account.usedMargin=1000;assert.deepEqual(validate(s),[]);
});
test('all MT5 quoted instruments can calculate; absent quotes remain absent',()=>{
  for(const [id] of mt5){let missing=0;
    for(const spec of catalog(id)){
      const s=demo();s.positions=[position(instrumentSettings(spec,'USD',id))];
      if(!spec.quoteAvailable){missing++;assert.ok(['ANT','USDVND'].includes(spec.originalSymbol));assert.ok(Number.isNaN(s.positions[0].price));assert.ok(Number.isNaN(instrumentSettings(spec,'USD',id,'SELL').price));assert.ok(validate(s).length);continue;}
      const r=analyze(s);assert.deepEqual(r.errors,[],`${id}/${spec.symbol}`);assert.ok(Number.isFinite(r.current.margin));
      assert.equal(spec.commissionKnown,false);
    }
    assert.equal(missing,2);
  }
});
test('manual current price restores Equity analysis without inventing an entry price',()=>{
  const s=demo();s.positions=[position(instrumentSettings(findInstrument('ANT','mt5-real-ecn'),'USD','mt5-real-ecn'))];
  s.positions[0].price=5;assert.deepEqual(validate(s),[]);assert.ok(Number.isFinite(analyze(s).stressed.equity));
  assert.ok(Number.isNaN(s.positions[0].entry));s.account.mode='balance';assert.ok(validate(s).some(e=>e.includes('цена входа')));
});
