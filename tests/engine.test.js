import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,position,analyze,evaluate,validate} from '../src/engine.js';
const near = (a,b,t=1e-7) => assert.ok(Math.abs(a-b) < t, `${a} ≠ ${b}`);
test('fixed margin agrees with closed-form BUY and SELL equations', () => {
  for (const side of ['BUY','SELL']) {
    const s=demo(); s.account.capital=12000; s.positions=[position({side,price:1.2,entry:1.1,lots:2,leverage:100,marginMode:'fixed'})];
    const r=analyze(s); near(r.c.margin,2400);
    const sign=side==='BUY' ? -1:1;
    for(const [key,t] of [['call',1],['stop',.2]]) {
      const price=1.2*(1+r[key].shock); near(price,1.2+sign*(12000-2400*t)/200000);
      near(evaluate(r.c,r[key].shock,s.account).level,t*100);
    }
  }
});
test('dynamic margin solves the actual threshold, not a fixed-margin approximation', () => {
  const s=demo(),r=analyze(s); const p=s.positions[0];
  const expected=(p.lots*p.contract*p.price-s.account.capital)/(p.lots*p.contract*(1-.2/p.leverage));
  near(p.price*(1+r.stop.shock),expected);
  near(evaluate(r.c,r.stop.shock,s.account).level,20);
});
test('balance and equity give identical scenarios with equivalent starting capital', () => {
  const s=demo();s.account.mode='balance';s.account.adjustment=-25;s.positions[0].entry=1.08;
  const r=analyze(s);near(r.current.equity,10475);
  s.account.capital=r.current.equity;s.account.mode='equity';near(analyze(s).stressed.equity,r.stressed.equity);
});
test('opposite positions cancel P&L but retain gross margin', () => {
  const s=demo();s.positions.push(position({side:'SELL'}));for(const p of s.positions)p.marginMode='fixed';
  const r=analyze(s);near(r.c.equitySlope,0);near(r.c.margin,2170);assert.equal(r.stop.kind,'unreachable');
});
test('fixed quote currency conversion applies once to P&L and margin', () => {
  const s=demo();s.account.currency='EUR';s.positions[0].conversion=.9;
  const r=analyze(s);near(r.c.margin,976.5);near(r.stressed.pnlChange,100000*1.085*.9*(-.03));
});
test('manual margin stays fixed across shocks', () => {
  const s=demo();s.positions[0].marginMode='manual';s.positions[0].manualMargin=555;
  near(analyze(s).stressed.margin,555);
});
test('breached thresholds, no margin, and zero equity stay explicit', () => {
  const s=demo();s.account.capital=100;assert.equal(analyze(s).stop.kind,'breached');
  s.positions[0].marginMode='manual';s.positions[0].manualMargin=0;assert.equal(analyze(s).current.level,null);assert.equal(analyze(s).stop.kind,'no-margin');
  s.positions[0].manualMargin=100;s.account.capital=0;assert.equal(analyze(s).current.status,'stopout');
});
test('negative beta gives upward/downward valid-price boundaries; no price clamping', () => {
  const s=demo();s.positions[0].beta=-2;const r=analyze(s);
  assert.equal(evaluate(r.c,.5,s.account),null);assert.ok(evaluate(r.c,.49,s.account));
  assert.ok(r.stop.shock>0);near(evaluate(r.c,r.stop.shock,s.account).level,20);
});
test('validates malformed, missing, nonfinite, duplicate, zero, and inverted thresholds', () => {
  assert.ok(validate(null).length);
  const malformed=demo();malformed.positions=[null];assert.ok(validate(malformed).length);
  for(const [key,value] of [['lots',0],['leverage',0],['side','LONG'],['conversion',Infinity],['beta',6]]) {
    const s=demo();s.positions[0][key]=value;assert.ok(validate(s).length);
  }
  const s=demo();s.positions.push({...s.positions[0]});assert.ok(validate(s).length);
  s.account.stopOut=110;assert.ok(validate(s).length);
});
test('random portfolios: each reachable root reconciles independently to its threshold', () => {
  let seed=123;const rand=()=>((seed=(seed*16807)%2147483647)-1)/2147483646;
  for(let i=0;i<300;i++) {
    const s=demo();s.account.capital=2000+rand()*20000;
    s.positions=Array.from({length:1+Math.floor(rand()*5)},()=>position({side:rand()>.5?'BUY':'SELL',lots:.1+rand()*2,price:.5+rand(),beta:rand()*4-2,marginMode:rand()>.5?'fixed':'dynamic'}));
    const r=analyze(s);assert.deepEqual(r.errors,[]);
    for(const [key,t] of [['call',100],['stop',20]])if(r[key].kind==='reachable') {
      const x=r[key].shock;
      let eq=s.account.capital,m=0;
      for(const p of s.positions) {
        const price=p.price*(1+p.beta*x),q=p.lots*p.contract;
        eq+=(p.side==='BUY'?1:-1)*q*(price-p.price)*p.conversion;
        m+=q*(p.marginMode==='fixed'?p.price:price)/p.leverage*p.conversion;
      }
      near(eq/m*100,t,1e-5);
    }
  }
});
