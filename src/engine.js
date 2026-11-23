// Linear contracts. All monetary results are in account currency.
export const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'RUB', 'USDT'];
export function position(overrides = {}) {
  return { id: globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random()}`, symbol: 'EURUSD', side: 'BUY', lots: 1, contract: 100000, price: 1.085, entry: 1.085, leverage: 100, conversion: 1, quote: 'USD', beta: 1, marginMode: 'dynamic', manualMargin: 1000, swap:0, commission:0, tick:0.00001, pnlMode:'linear', moneyPerPrice:100000, ...overrides };
}
export function demo() {
  return { version: 1, account: { currency: 'USD', mode: 'equity', capital: 10000, adjustment: 0, otherMargin: 0, marginCall: 100, stopOut: 20 }, positions: [position()], shock: -3, range: 12 };
}
export const presets = {
  EURUSD: { symbol: 'EURUSD', quote: 'USD', price: 1.085, entry: 1.085, contract: 100000, lots: 1, leverage: 100, conversion: 1 },
  XAUUSD: { symbol: 'XAUUSD', quote: 'USD', price: 2650, entry: 2650, contract: 100, lots: 0.1, leverage: 100, conversion: 1 },
  BTCUSD: { symbol: 'BTCUSD', quote: 'USD', price: 90000, entry: 90000, contract: 1, lots: 0.1, leverage: 10, conversion: 1 },
  USOIL: { symbol: 'USOIL', quote: 'USD', price: 75, entry: 75, contract: 1000, lots: 0.1, leverage: 20, conversion: 1 },
};
const finite = x => typeof x === 'number' && Number.isFinite(x);
export function validate(s) {
  const errors = [];
  if (!s || s.version !== 1 || !s.account || !Array.isArray(s.positions)) return ['Неверный формат сценария.'];
  const a = s.account;
  if (!currencies.includes(a.currency)) errors.push('Выберите валюту счета.');
  if (!['equity', 'balance'].includes(a.mode)) errors.push('Выберите режим капитала.');
  if(a.marginPolicy!==undefined&&!['gross','larger','hedged'].includes(a.marginPolicy)) errors.push('Неизвестный режим учета встречных позиций.');
  if(a.thresholdUnit!==undefined&&!['percent','money'].includes(a.thresholdUnit)) errors.push('Неизвестная единица порогов.');
  if(a.marginSource!==undefined&&!['terminal','positions'].includes(a.marginSource))errors.push('Неизвестный источник занятой маржи.');
  if(a.marginSource==='terminal'&&(!finite(a.usedMargin)||a.usedMargin<0||a.usedMargin>1e14))errors.push('Used Margin: введите сумму от 0 до 10¹⁴.');
  for (const [key, label] of [['capital', 'Капитал'], ['adjustment', 'Корректировка']]) if (!finite(a[key]) || Math.abs(a[key]) > 1e14) errors.push(`${label}: введите конечное число до 10¹⁴ по модулю.`);
  if (!finite(a.otherMargin) || a.otherMargin < 0 || a.otherMargin > 1e14) errors.push('Прочая маржа должна быть от 0 до 10¹⁴.');
  const maxThreshold=a.thresholdUnit==='money'?1e14:10000;
  if (!finite(a.stopOut) || !finite(a.marginCall) || a.stopOut < 0 || a.marginCall <= 0 || a.marginCall <= a.stopOut || a.marginCall > maxThreshold) errors.push(`Пороги: 0 ≤ Stop Out < Margin Call ≤ ${maxThreshold}${a.thresholdUnit==='money'?' в валюте счета':'%'}.`);
  if (!s.positions.length) errors.push('Добавьте хотя бы одну позицию.');
  const ids = new Set();
  s.positions.forEach((p, i) => {
    const prefix = `Позиция ${i + 1}: `;
    if (!p || typeof p !== 'object' || Array.isArray(p)) { errors.push(prefix + 'неверный формат позиции.'); return; }
    if (typeof p.id !== 'string' || ids.has(p.id)) errors.push(prefix + 'идентификатор должен быть уникальным.');
    ids.add(p.id);
    if (typeof p.symbol !== 'string' || !p.symbol.trim() || p.symbol.length > 24) errors.push(prefix + 'название инструмента — от 1 до 24 символов.');
    if (typeof p.quote !== 'string' || !/^[A-Z]{3,5}$/.test(p.quote)) errors.push(prefix + 'укажите валюту котировки буквами A–Z.');
    if (!['BUY', 'SELL'].includes(p.side)) errors.push(prefix + 'выберите BUY или SELL.');
    const numberFields=[['lots', 'объем', 1e6], ['contract', 'контракт', 1e9], ['price', 'текущая цена', 1e9], ['leverage', 'плечо', 1e6], ['conversion', 'курс конвертации', 1e6]];
    if(a.mode==='balance')numberFields.push(['entry','цена входа',1e9]);
    for (const [key, label, max] of numberFields) {
      if (!finite(p[key]) || p[key] <= 0 || p[key] > max) errors.push(prefix + `${label} должен быть больше 0 и не больше ${max}.`);
    }
    if (p.quote === a.currency && p.conversion !== 1) errors.push(prefix + 'для валюты котировки, совпадающей с валютой счета, курс должен быть 1.');
    if (!finite(p.beta) || Math.abs(p.beta) > 5) errors.push(prefix + 'чувствительность должна быть от −5 до 5.');
    for(const key of ['swap','commission'])if(p[key]!==undefined&&!finite(p[key]))errors.push(prefix+'своп и комиссия должны быть конечными числами.');
    if(p.tick!==undefined&&(!finite(p.tick)||p.tick<=0))errors.push(prefix+'минимальный шаг цены должен быть положительным.');
    if(p.pnlMode!==undefined&&!['linear','custom'].includes(p.pnlMode))errors.push(prefix+'неизвестная модель P&L.');
    if(p.pnlMode==='custom'&&(!finite(p.moneyPerPrice)||p.moneyPerPrice<=0))errors.push(prefix+'стоимость изменения цены должна быть положительной.');
    if (!['fixed', 'dynamic', 'manual', 'broker'].includes(p.marginMode)) errors.push(prefix + 'неизвестная модель маржи.');
    if (!finite(p.manualMargin) || p.manualMargin < 0 || p.manualMargin > 1e14) errors.push(prefix + 'ручная маржа должна быть от 0 до 10¹⁴.');
    if(p.marginMode==='broker') {
      const spec=p.spec;
      if(!spec||typeof spec!=='object'||![0,1].includes(spec.marginMode)||![0,2].includes(spec.profitMode)||!finite(spec.marginDivider)||spec.marginDivider<=0||!finite(spec.lotMin)||!finite(spec.lotMax)||!finite(spec.lotStep)||spec.lotStep<=0) {errors.push(prefix+'некорректная спецификация брокера.');return;}
      if(spec.profitCurrency!==p.quote)errors.push(prefix+'валюта P&L не совпадает со спецификацией. Выберите ручную модель или восстановите инструмент.');
      const derivedRate=spec.marginCurrency===a.currency||(spec.marginMode===0&&spec.marginCurrency===spec.base);
      if(!derivedRate&&(!finite(p.marginConversion)||p.marginConversion<=0))errors.push(prefix+'укажите курс валюты маржи к валюте счета.');
      if(p.lots<spec.lotMin-1e-9||p.lots>spec.lotMax+1e-9)errors.push(prefix+`объем по спецификации — от ${spec.lotMin} до ${spec.lotMax} лота.`);
      const steps=p.lots/spec.lotStep;
      if(Math.abs(steps-Math.round(steps))>1e-6)errors.push(prefix+`объем должен соответствовать шагу ${spec.lotStep} лота.`);
    }
  });
  if(a.marginSource!=='terminal'&&a.marginPolicy&&a.marginPolicy!=='gross'&&!errors.length) {
    const groups=new Map();
    for(const p of s.positions){if(!groups.has(p.symbol))groups.set(p.symbol,[]);groups.get(p.symbol).push(p);}
    for(const [symbol,ps] of groups) {
      if(a.marginPolicy==='hedged'&&ps.some(p=>!p.spec||p.marginMode!=='broker'))errors.push(`${symbol}: учет хеджа по спецификации требует модель Investizo для всех строк.`);
      if(a.marginPolicy==='hedged'&&ps.some(p=>!finite(p.spec?.hedgedMargin)||p.spec.hedgedMargin<0))errors.push(`${symbol}: API не передал Hedged Margin. Используйте Used Margin из терминала или другую политику.`);
      const first=ps[0];
      for(const p of ps.slice(1)) {
        const keys=['price','contract','leverage','conversion','beta','marginMode','marginConversion'];
        if(keys.some(k=>p[k]!==first[k])||p.marginMode==='manual') {errors.push(`${symbol}: для учета встречных позиций задайте одинаковую цену, чувствительность, контракт, плечо, конвертацию и модель маржи.`);break;}
        if(p.spec&&first.spec&&(p.spec.marginDivider!==first.spec.marginDivider||p.spec.hedgedMargin!==first.spec.hedgedMargin)) {errors.push(`${symbol}: спецификации встречных позиций должны совпадать.`);break;}
      }
    }
  }
  if (!finite(s.shock) || s.shock < -99 || s.shock > 100) errors.push('Стресс должен быть от −99% до +100%.');
  if (!finite(s.range) || s.range < 1 || s.range > 99) errors.push('Диапазон графика должен быть от 1% до 99%.');
  return errors;
}
export function coefficients(s) {
  let equity = s.account.capital;
  let margin = s.account.otherMargin;
  let equitySlope = 0, marginSlope = 0, gross = 0;
  let lower = -1, upper = Infinity;
  const positions = s.positions.map(p => {
    const units = p.lots * p.contract;
    const signed = p.side === 'BUY' ? 1 : -1;
    const pnlUnits=p.pnlMode==='custom'?p.moneyPerPrice:units*p.conversion;
    const pnl = finite(p.entry)?signed*pnlUnits*(p.price-p.entry)+(p.swap??0)+(p.commission??0):null;
    const notional = units * p.price * p.conversion;
    let m = p.marginMode === 'manual' ? p.manualMargin : notional / p.leverage;
    const slope = signed * pnlUnits * p.price * p.beta;
    let ms = p.marginMode === 'dynamic' ? m * p.beta : 0;
    if(p.marginMode==='broker') {
      const spec=p.spec;
      if(spec.marginMode===0) {
        // Forex margin is denominated in margin currency, not necessarily quote currency.
        // Base→quote uses the scenario price; quote→account stays at the input rate.
        const isBase=spec.marginCurrency===spec.base;
        const viaPrice=isBase&&s.account.currency!==spec.base;
        const rate=s.account.currency===spec.marginCurrency?1:viaPrice?p.price*p.conversion:p.marginConversion;
        m=units/p.leverage/spec.marginDivider*rate;
        ms=viaPrice?m*p.beta:0;
      } else {
        const rate=s.account.currency===spec.marginCurrency?1:p.marginConversion;
        m=units*p.price/spec.marginDivider*rate;
        ms=m*p.beta;
      }
    }
    if (p.beta > 0) lower = Math.max(lower, -1 / p.beta);
    if (p.beta < 0) upper = Math.min(upper, -1 / p.beta);
    if (s.account.mode === 'balance') equity += pnl;
    equitySlope += slope; margin += m; marginSlope += ms; gross += notional;
    return { ...p, units, pnl, notional, margin: m, slope, marginSlope: ms };
  });
  if(s.account.marginSource!=='terminal'&&s.account.marginPolicy&&s.account.marginPolicy!=='gross') {
    margin=s.account.otherMargin;marginSlope=0;
    const groups=new Map();
    for(const p of positions){if(!groups.has(p.symbol))groups.set(p.symbol,[]);groups.get(p.symbol).push(p);}
    for(const ps of groups.values()) {
      const buys=ps.filter(p=>p.side==='BUY'),sells=ps.filter(p=>p.side==='SELL');
      const sum=(list,key)=>list.reduce((n,p)=>n+p[key],0);
      const mb=sum(buys,'margin'),ms=sum(sells,'margin');
      const large=mb>=ms?buys:sells,small=mb>=ms?sells:buys;
      if(s.account.marginPolicy==='larger'){margin+=sum(large,'margin');marginSlope+=sum(large,'marginSlope');}
      else {
        const factor=ps[0].spec.hedgedMargin/ps[0].contract;
        margin+=sum(large,'margin')+(factor-1)*sum(small,'margin');
        marginSlope+=sum(large,'marginSlope')+(factor-1)*sum(small,'marginSlope');
      }
    }
  }
  if(s.account.marginSource==='terminal'){margin=s.account.usedMargin;marginSlope=0;}
  if (s.account.mode === 'balance') equity += s.account.adjustment;
  return { equity, margin, equitySlope, marginSlope, gross, lower, upper, positions };
}
export function evaluate(c, shock, a) {
  if (!finite(shock) || shock <= c.lower || shock >= c.upper) return null;
  const equity = c.equity + c.equitySlope * shock;
  const margin = c.margin + c.marginSlope * shock;
  const level = margin > 1e-9 ? equity / margin * 100 : null;
  const so=a.thresholdUnit==='money'?a.stopOut:margin*a.stopOut/100;
  const mc=a.thresholdUnit==='money'?a.marginCall:margin*a.marginCall/100;
  const status = a.thresholdUnit!=='money'&&margin<=1e-9 ? 'no-margin' : equity <= so + 1e-8 ? 'stopout' : equity <= mc + 1e-8 ? 'call' : 'normal';
  return { equity, margin, level, free: equity - margin, pnlChange: equity - c.equity, status, leverage: equity > 0 ? (c.gross + c.positions.reduce((sum, p) => sum + p.notional * p.beta * shock, 0)) / equity : null };
}
export function threshold(c, percent,unit='percent') {
  if (unit!=='money'&&c.margin <= 1e-9) return { kind: 'no-margin', shock: null };
  const t = unit==='money'?0:percent / 100;
  const distance = c.equity - (unit==='money'?percent:t*c.margin);
  if (distance <= 1e-8) return { kind: 'breached', shock: 0 };
  const slope = c.equitySlope - t * c.marginSlope;
  if (Math.abs(slope) < 1e-9) return { kind: 'unreachable', shock: null };
  const shock = -distance / slope;
  // At zero price / zero margin the percentage ratio is undefined.
  if (shock <= c.lower + 1e-12 || shock >= c.upper - 1e-12 || (unit!=='money'&&c.margin+c.marginSlope*shock<=1e-9)) return { kind: 'unreachable', shock: null };
  return { kind: 'reachable', shock };
}
export function analyze(s) {
  const errors = validate(s);
  if (errors.length) return { errors };
  const c = coefficients(s);
  return { errors, c, current: evaluate(c, 0, s.account), stressed: evaluate(c, s.shock / 100, s.account), call: threshold(c, s.account.marginCall,s.account.thresholdUnit), stop: threshold(c, s.account.stopOut,s.account.thresholdUnit) };
}
export function scenarioRows(s, shocks = [-10, -5, -3, -1, 0, 1, 3, 5, 10]) {
  const result = analyze(s);
  if (result.errors.length) return [];
  return [...new Set([...shocks, s.shock])].sort((a,b) => a-b).map(shock => ({ shock, ...evaluate(result.c, shock / 100, s.account), valid: !!evaluate(result.c, shock / 100, s.account) }));
}

// Binary search for one symbol at a time. Other symbols' prices remain unchanged.
// All rows of the selected symbol move by the same absolute price delta, preserving spread.
export function criticalPrices(s,downPercent=99,upPercent=500) {
  if(validate(s).length)return [];
  const groups=new Map();for(const p of s.positions){if(!groups.has(p.symbol))groups.set(p.symbol,[]);groups.get(p.symbol).push(p);}
  return [...groups].map(([symbol,ps])=>{
    const reference=ps[0].price,tick=ps[0].tick??ps[0].spec?.point??0.00001;
    const scenario={...s,positions:s.positions.map(p=>({...p,beta:p.symbol===symbol?reference/p.price:0}))};
    const c=coefficients(scenario);
    const gap=(shock,t)=>{const v=evaluate(c,shock,s.account);return v?v.equity-(s.account.thresholdUnit==='money'?t:v.margin*t/100):null;};
    function find(t,direction){
      if(s.account.thresholdUnit!=='money'&&c.margin<=1e-9)return {kind:'no-margin'};
      if(gap(0,t)<=1e-8)return {kind:'breached',price:reference,delta:0,percent:0};
      let bound=direction<0?Math.max(-downPercent/100,c.lower+tick/reference):Math.min(upPercent/100,c.upper-tick/reference);
      if(!Number.isFinite(bound)||bound*direction<=0||gap(bound,t)===null||gap(bound,t)>0)return {kind:'unreachable'};
      let healthy=0,breached=bound;
      for(let i=0;i<100;i++){const mid=(healthy+breached)/2;if(gap(mid,t)>0)healthy=mid;else breached=mid;if(Math.abs(healthy-breached)*reference<tick*1e-7)break;}
      const exact=reference*(1+breached),tickCount=exact/tick;
      const price=(direction<0?Math.floor(tickCount+1e-7):Math.ceil(tickCount-1e-7))*tick;
      if(price<=0)return {kind:'unreachable'};
      return {kind:'reachable',price,delta:price-reference,percent:(price/reference-1)*100,direction,exactPrice:exact,tick};
    }
    return {symbol,reference,tick,quote:ps[0].quote,callDown:find(s.account.marginCall,-1),callUp:find(s.account.marginCall,1),stopDown:find(s.account.stopOut,-1),stopUp:find(s.account.stopOut,1),netLots:ps.reduce((n,p)=>n+(p.side==='BUY'?p.lots:-p.lots),0)};
  });
}
