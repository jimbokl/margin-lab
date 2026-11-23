import { demo, position, validate, analyze, evaluate, scenarioRows,criticalPrices } from './engine.js';
import {marketData,catalog,findInstrument,instrumentSettings,categoryNames,accountNames,specMarginLabel,conversionRate} from './instruments.js';
import {parseCsv,csvTemplate} from './csv.js';

const $ = id => document.getElementById(id);
const KEY = 'margin-lab-v1';
const SAVED = 'margin-lab-scenarios-v1';
const escape = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (x, digits=2) => Number.isFinite(x) ? new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(x) : '—';
const signed = (x,d=2) => `${x>0?'+':x<0?'−':''}${num(Math.abs(x),d)}`;
const percent = x => Number.isFinite(x) ? `${num(x,1)}%` : '—';
const money = x => `${num(x)} ${state.account.currency}`;
const names = { normal:'Выше порогов', call:'Margin Call', stopout:'Stop Out', 'no-margin':'Нет маржи' };
const status = x => `<span class="status ${escape(x)}">${names[x]??'—'}</span>`;
const clone = x => structuredClone(x);
function deskDemo(){const s=demo();s.brokerAccount='mt4-real-ecn';s.account.marginPolicy='gross';s.account.marginSource='terminal';s.account.usedMargin=1000;s.account.thresholdUnit='percent';s.account.label='DEMO / клиентский счет';s.searchDown=99;s.searchUp=500;Object.assign(s.positions[0],instrumentSettings(findInstrument('EURUSD',s.brokerAccount),'USD',s.brokerAccount),{lots:1});return s;}
let timer, storageWarned = false, saved = [], state = deskDemo(), lastAnalysis;
function toast(message) { $('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>$('toast').classList.remove('visible'),4200); }
function readState(value) {
  if (typeof value !== 'string' || value.length > 150000) throw new Error('Файл слишком большой. Максимум 150 КБ.');
  const parsed = JSON.parse(value);
  const errors = validate(parsed);
  if (errors.length) throw new Error(errors.slice(0,3).join(' '));
  parsed.account.marginCall=100;parsed.account.stopOut=20;parsed.account.thresholdUnit='percent';
  return parsed;
}
function persist() {
  if (validate(state).length) return;
  try { localStorage.setItem(KEY,JSON.stringify(state)); }
  catch { if(!storageWarned){ toast('Браузер не разрешает сохранение. Используйте экспорт JSON.');storageWarned=true; } }
}
try {
  const stored=localStorage.getItem(KEY);if(stored)state=readState(stored);
  const raw=JSON.parse(localStorage.getItem(SAVED)||'[]');
  if(Array.isArray(raw)) saved=raw.filter(x=>x&&typeof x.name==='string'&&typeof x.id==='string'&&!validate(x.state).length).slice(0,4);
  if(localStorage.getItem('margin-lab-theme')==='light')document.documentElement.dataset.theme='light';
} catch { toast('Сохраненные настройки недоступны. Открыт демопример.'); }
if(location.hash.startsWith('#s=')) {
  try {
    const encoded=location.hash.slice(3);if(encoded.length>200000)throw new Error('Слишком длинная ссылка.');
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    state=readState(new TextDecoder().decode(bytes));
    // A shared scenario becomes a local editable copy, never a remote document.
    history.replaceState(null,'',location.pathname+location.search);
    toast('Сценарий из ссылки загружен на это устройство.');
  } catch { toast('Не удалось открыть сценарий: ссылка повреждена.'); }
}
function syncTheme() { const light=document.documentElement.dataset.theme==='light';$('theme').setAttribute('aria-label',`Переключить ${light?'темную':'светлую'} тему`); }
function accountControls() {
  for(const el of document.querySelectorAll('[data-account]'))el.value=state.account[el.dataset.account];
  const balance=state.account.mode==='balance';
  $('capital-label').textContent=balance?'Баланс счета':'Текущий Equity';
  $('capital-help').textContent=balance?'Добавим текущий P&L и корректировки.':'Включая плавающий результат всех позиций.';
  $('adjustment-field').hidden=!balance;
  $('broker-profile').value=state.brokerAccount??'mt4-real-ecn';
  $('account-label').value=state.account.label??'';
  $('margin-policy').value=state.account.marginPolicy??'gross';
  $('threshold-unit').value=state.account.thresholdUnit??'percent';
  $('margin-source').value=state.account.marginSource??'positions';
  $('usedMargin').disabled=state.account.marginSource!=='terminal';
  $('usedMargin').value=state.account.usedMargin??0;
  $('otherMargin').disabled=state.account.marginSource==='terminal';
  $('margin-policy').disabled=state.account.marginSource==='terminal';
  $('search-down').value=state.searchDown??99;$('search-up').value=state.searchUp??500;
  for(const id of ['marginCall','stopOut'])$(id).nextElementSibling.textContent=state.account.thresholdUnit==='money'?state.account.currency:'%';
  for(const b of $('capital-mode').querySelectorAll('button')){const on=b.dataset.mode===state.account.mode;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));}
  for(const el of document.querySelectorAll('.currency-unit'))el.textContent=state.account.currency;
  if(![...$('range').options].some(o=>Number(o.value)===state.range))$('range').add(new Option(`±${state.range}%`,state.range));
  $('range').value=state.range;
  syncShockControls();
}
function field(label,key,value,attrs='',help='') {
  const text=['symbol','quote'].includes(key);
  return `<label class="field">${label}<input data-position="${key}" type="${text?'text':'number'}" ${text?'':'step="any"'} value="${escape(Number.isNaN(value)?'':value)}" ${attrs}>${help?`<small>${help}</small>`:''}</label>`;
}
function renderPositions() {
  const open=new Set([...document.querySelectorAll('.position details[open]')].map(el=>el.closest('.position').dataset.id));
  $('positions').innerHTML=state.positions.map((p,i)=>`<article class="position" data-id="${escape(p.id)}" aria-label="Позиция ${i+1}">
    <div class="position-main">
      <label class="field">Инструмент<select class="symbol-select" data-preset aria-label="Пресет инструмента позиции ${i+1}">${Object.entries(categoryNames).map(([category,name])=>`<optgroup label="${name}">${catalog(state.brokerAccount).filter(spec=>spec.category===category).map(spec=>`<option value="${escape(spec.symbol)}" ${p.symbol===spec.symbol?'selected':''}>${escape(spec.symbol)}</option>`).join('')}</optgroup>`).join('')}<option value="CUSTOM" ${!findInstrument(p.symbol,state.brokerAccount)?'selected':''}>${findInstrument(p.symbol,state.brokerAccount)?'Свой инструмент':escape(p.symbol)}</option></select></label>
      <div class="field side-field"><span>Направление</span><div class="side-toggle" role="group" aria-label="Направление позиции ${i+1}">${['BUY','SELL'].map(k=>`<button class="${k.toLowerCase()} ${p.side===k?'on':''}" data-side="${k}" aria-pressed="${p.side===k}">${k}</button>`).join('')}</div></div>
      ${field('Объем, лоты','lots',p.lots,'min="0" class="lot-input"').replace('class="field"','class="field volume-field"')}
      ${field(`Цена, ${escape(p.quote)}`,'price',p.price,'min="0"').replace('class="field"','class="field price-field"')}
      ${field('Плечо, 1:','leverage',p.leverage,'min="1"').replace('class="field"','class="field leverage-field"')}
      <button class="remove-position" data-remove aria-label="Удалить позицию ${i+1}" ${state.positions.length===1?'disabled':''}>×</button>
    </div>
    <details ${open.has(p.id)?'open':''}><summary>Контракт, конвертация и модель маржи</summary><div class="position-advanced">
      ${field('Название','symbol',p.symbol,'maxlength="24"')}
      ${field('Размер контракта','contract',p.contract,'min="0"','Единиц актива в одном лоте')}
      ${field('Цена входа','entry',p.entry,`min="0" ${state.account.mode==='equity'?'disabled':''}`,state.account.mode==='equity'?'Для режима «От баланса»':'Для текущего плавающего P&L')}
      ${field(`Своп, ${escape(state.account.currency)}`,'swap',p.swap??0,state.account.mode==='equity'?'disabled':'','Накопленный; в Equity уже включен')}
      ${field(`Комиссии, ${escape(state.account.currency)}`,'commission',p.commission??0,state.account.mode==='equity'?'disabled':'','Расходы со знаком минус; без двойного учета')}
      ${field('Минимальный шаг цены','tick',p.tick??p.spec?.point??0.00001,'min="0"','Точность критических цен')}
      ${field('Валюта котировки','quote',p.quote,'maxlength="5"','Например, USD в EURUSD')}
      ${field(`1 ${escape(p.quote)} → ${escape(state.account.currency)}`,'conversion',p.conversion,`min="0" ${p.quote===state.account.currency?'readonly':''}`,'Фиксированный курс во всех сценариях')}
      ${field('Чувствительность, ×','beta',p.beta,'min="-5" max="5"','0 — цена не меняется; −1 — против рынка')}
      <label class="field wide-field">Модель P&amp;L<select data-position="pnlMode"><option value="linear" ${p.pnlMode!=='custom'?'selected':''}>Линейная · лоты × контракт × курс</option><option value="custom" ${p.pnlMode==='custom'?'selected':''}>Ручная стоимость изменения цены</option></select><small>Для нестандартного инструмента укажите денежный результат движения на 1,0 цены для всей позиции.</small></label>
      ${p.pnlMode==='custom'?field(`Стоимость +1,0 цены, ${escape(state.account.currency)}`,'moneyPerPrice',p.moneyPerPrice??1000,'min="0"','Для всей позиции. Знак BUY/SELL применяется автоматически.'):''}
      <label class="field wide-field">Модель маржи<select data-position="marginMode">${p.spec?`<option value="broker" ${p.marginMode==='broker'?'selected':''}>Investizo · ${escape(specMarginLabel(p.spec))}</option>`:''}<option value="dynamic" ${p.marginMode==='dynamic'?'selected':''}>Плавающая · номинал / плечо</option><option value="fixed" ${p.marginMode==='fixed'?'selected':''}>Фиксированная · по текущей цене</option><option value="manual" ${p.marginMode==='manual'?'selected':''}>Ручная · сумма из терминала</option></select><small>${p.spec?`${escape(accountNames[p.spec.accountType]??'Investizo')} · мин. ${p.spec.lotMin}, шаг ${p.spec.lotStep}, макс. ${p.spec.lotMax} лота`: 'Для нестандартных условий используйте ручную маржу.'}</small></label>
      ${p.spec&&p.marginMode==='broker'&&p.spec.marginCurrency!==state.account.currency&&!(p.spec.marginMode===0&&p.spec.marginCurrency===p.spec.base)?field(`1 ${escape(p.spec.marginCurrency)} → ${escape(state.account.currency)} (маржа)`,'marginConversion',p.marginConversion,'min="0"','Курс валюты маржи; отдельно от валюты P&L'):''}
      ${field(`Ручная маржа, ${escape(state.account.currency)}`,'manualMargin',p.manualMargin,`min="0" ${p.marginMode!=='manual'?'disabled':''}`,'Сумма для всей позиции, а не одного лота')}
    </div></details>${p.spec?`<div class="spec-source"><span>${escape(accountNames[p.spec.accountType]??'Investizo')} · ${escape(specMarginLabel(p.spec))}</span>${p.spec.tradeMode===1?'<span class="negative">Только закрытие</span>':''}<button class="text-button" data-spec-view>Спецификация</button></div>`:''}
  </article>`).join('');
  $('position-count').textContent=state.positions.length;
  $('add-position').disabled=false;
}
function syncShockControls() {
  const span=Math.max(state.range,Math.ceil(Math.abs(state.shock)));
  $('shock').min=-Math.min(span,99);$('shock').max=Math.min(span,100);
  $('shock').value=state.shock;$('shock-number').value=state.shock;
  $('shock-min').textContent=`−${Math.min(span,99)}%`;$('shock-max').textContent=`+${Math.min(span,100)}%`;
  for(const b of document.querySelectorAll('[data-shock]'))b.classList.toggle('selected',Number(b.dataset.shock)===state.shock);
}
function renderThreshold(key,result,c) {
  const t=key==='call'?state.account.marginCall:state.account.stopOut;
  $(`${key}-percent`).textContent=state.account.thresholdUnit==='money'?money(t):percent(t);
  const value=$(`${key}-value`),detail=$(`${key}-detail`),price=$(`${key}-price`);
  if(result.kind==='reachable') {
    value.textContent=signed(result.shock*100)+'%';
    detail.textContent=`${result.shock<0?'При снижении':'При росте'} общего рынка от текущего уровня`;
    const moving=c.positions.filter(p=>p.beta!==0);
    if(moving.length===1) {const p=moving[0];price.textContent=`${p.symbol}: ${num(p.price*(1+p.beta*result.shock),p.price<10?6:2)} ${p.quote}`;}
    else price.textContent=`Капитал на пороге: ${money(evaluate(c,result.shock,state.account).equity)}`;
  } else {
    value.textContent=result.kind==='breached'?'Уже достигнут':result.kind==='no-margin'?'Нет маржи':'Не достигается';
    detail.textContent=result.kind==='breached'?'Текущий Equity уже на пороге или ниже':result.kind==='no-margin'?'Уровень маржи не определен':'В области положительных цен этой модели';
    price.textContent=result.kind==='unreachable'?'Проверьте чувствительность и встречные позиции':result.kind==='no-margin'?'Укажите маржу из терминала при необходимости':'Сценарий начинается за критическим уровнем';
  }
}
const compact = x => {
  const a=Math.abs(x);return a>=1e9?`${num(x/1e9,1)} млрд`:a>=1e6?`${num(x/1e6,1)} млн`:a>=1000?`${num(x/1000,1)}k`:num(x,0);
};
function drawChart(r) {
  const w=Math.max(280,$('chart').clientWidth),h=$('chart').clientHeight,pad={l:w<500?45:69,r:18,t:26,b:30},c=r.c;
  const lo=Math.max(-state.range/100,c.lower+1e-6),hi=Math.min(state.range/100,c.upper-1e-6);
  const vals=[];
  for(let i=0;i<=80;i++){const s=lo+(hi-lo)*i/80,v=evaluate(c,s,state.account);vals.push({s,...v});}
  const thresholdAmount=(v,key)=>state.account.thresholdUnit==='money'?state.account[key]:v.margin*state.account[key]/100;
  const amounts=vals.flatMap(v=>[v.equity,thresholdAmount(v,'marginCall'),thresholdAmount(v,'stopOut')]);
  let ymin=Math.min(...amounts,0),ymax=Math.max(...amounts,1);const span=ymax-ymin;ymin-=span*.05;ymax+=span*.12;
  const X=s=>pad.l+(s-lo)/(hi-lo)*(w-pad.l-pad.r),Y=v=>h-pad.b-(v-ymin)/(ymax-ymin)*(h-pad.t-pad.b);
  const path=fn=>vals.map((v,i)=>`${i?'L':'M'}${X(v.s).toFixed(2)},${Y(fn(v)).toFixed(2)}`).join(' ');
  const equityPath=path(v=>v.equity);
  const grid=Array.from({length:5},(_,i)=>{const val=ymin+(ymax-ymin)*i/4,y=Y(val);return `<line x1="${pad.l}" y1="${y}" x2="${w-pad.r}" y2="${y}" stroke="var(--line)" stroke-dasharray="3 6"/><text x="${pad.l-12}" y="${y+3}" text-anchor="end">${compact(val)}</text>`;}).join('');
  const tickCount=w<500?5:7;
  const ticks=Array.from({length:tickCount},(_,i)=>{const s=lo+(hi-lo)*i/(tickCount-1);return `<text x="${X(s)}" y="${h-7}" text-anchor="middle">${signed(s*100,1)}%</text>`;}).join('');
  const markers=[['call',r.call,'var(--amber)'],['stop',r.stop,'var(--rose)']].filter(([,t])=>t.kind==='reachable'&&t.shock>lo&&t.shock<hi).map(([k,t,color],i)=>`<line x1="${X(t.shock)}" x2="${X(t.shock)}" y1="${pad.t}" y2="${h-pad.b}" stroke="${color}" opacity=".4" stroke-dasharray="3 5"/><circle cx="${X(t.shock)}" cy="${Y(evaluate(c,t.shock,state.account).equity)}" r="4" fill="${color}"/><text x="${Math.min(w-72,Math.max(pad.l+5,X(t.shock)+7))}" y="${pad.t+9+i*16}" style="fill:${color};font-size:9px">${k==='call'?'MC':'SO'} ${signed(t.shock*100)}%</text>`).join('');
  const shock=state.shock/100,selected=evaluate(c,shock,state.account);
  let cursor='';
  if(selected&&shock>=lo&&shock<=hi)cursor=`<line x1="${X(shock)}" x2="${X(shock)}" y1="${pad.t}" y2="${h-pad.b}" stroke="var(--text)" opacity=".3"/><circle cx="${X(shock)}" cy="${Y(selected.equity)}" r="5" fill="var(--mint)" stroke="var(--panel)" stroke-width="2"/>`;
  $('chart').innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-labelledby="graph-title graph-desc"><title id="graph-title">Equity и пороги маржи при движении рынка</title><desc id="graph-desc">Текущий капитал ${escape(money(r.current.equity))}. Зеленая линия — капитал, желтая — капитал на Margin Call, розовая — на Stop Out. Точные значения доступны в таблице сценариев ниже.</desc><defs><linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--mint)" stop-opacity=".12"/><stop offset="1" stop-color="var(--mint)" stop-opacity="0"/></linearGradient><clipPath id="plot-clip"><rect x="${pad.l}" y="${pad.t}" width="${w-pad.l-pad.r}" height="${h-pad.t-pad.b}"/></clipPath></defs>${grid}${ticks}<text x="${pad.l}" y="11" style="font-size:9px">${escape(state.account.currency)}</text><g clip-path="url(#plot-clip)"><path d="${equityPath} L${X(hi)},${h-pad.b} L${X(lo)},${h-pad.b} Z" fill="url(#equity-fill)"/>${lo<0&&hi>0?`<line x1="${X(0)}" x2="${X(0)}" y1="${pad.t}" y2="${h-pad.b}" stroke="var(--quiet)" opacity=".25"/>`:''}<path d="${path(v=>thresholdAmount(v,'marginCall'))}" fill="none" stroke="var(--amber)" stroke-width="1.5" stroke-dasharray="5 5"/><path d="${path(v=>thresholdAmount(v,'stopOut'))}" fill="none" stroke="var(--rose)" stroke-width="1.5" stroke-dasharray="5 5"/><path d="${equityPath}" fill="none" stroke="var(--mint)" stroke-width="2.5"/>${markers}${cursor}</g></svg>`;
  $('chart').onclick=e=>{const rect=$('chart').getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width*w;if(px<pad.l||px>w-pad.r)return;setShock(Math.round((lo+(px-pad.l)/(w-pad.l-pad.r)*(hi-lo))*1000)/10);};
}
function renderStress(r) {
  const v=r.stressed;
  if(!v){$('stress-result').innerHTML='<div class="error-box">Этот стресс дает нулевую или отрицательную цену хотя бы одной позиции. Уменьшите стресс или чувствительность.</div>';return;}
  const moneyMode=state.account.thresholdUnit==='money';
  const mcAmount=moneyMode?state.account.marginCall:v.margin*state.account.marginCall/100;
  const soAmount=moneyMode?state.account.stopOut:v.margin*state.account.stopOut/100;
  const deficitCall=Math.max(0,mcAmount-v.equity),deficitStop=Math.max(0,soAmount-v.equity);
  $('stress-result').innerHTML=`<div class="stress-stats"><div class="stress-stat"><span>Equity в сценарии</span><strong>${num(v.equity)}</strong><small class="${v.pnlChange<0?'negative':v.pnlChange>0?'positive':''}">${signed(v.pnlChange)} ${escape(state.account.currency)} к текущему</small></div><div class="stress-stat"><span>Уровень маржи</span><strong>${percent(v.level)}</strong><small>${status(v.status)}</small></div></div><div class="protection"><div>Дефицит до Margin Call: <strong>${money(deficitCall)}</strong></div><div>Дефицит до Stop Out: <strong>${money(deficitStop)}</strong></div><div>Буфер до Stop Out: <strong>${money(Math.max(0,v.equity-soAmount))}</strong></div></div>`;
}
function renderRows() {
  $('scenario-rows').innerHTML=scenarioRows(state).map(v=>`<tr data-row-shock="${v.shock}" class="${Math.abs(v.shock-state.shock)<1e-8?'chosen':''}"><td><button aria-label="Выбрать стресс ${v.shock}%">${signed(v.shock,1)}%</button></td><td>${v.valid?num(v.equity):'—'}</td><td>${v.valid?percent(v.level):'—'}</td><td>${v.valid?status(v.status):'<span class="status no-margin">Цена ≤ 0</span>'}</td></tr>`).join('');
}
function renderExposure(r){
  const groups=new Map();for(const p of r.c.positions){if(!groups.has(p.symbol))groups.set(p.symbol,{buy:0,sell:0,slope:0});const g=groups.get(p.symbol);g[p.side==='BUY'?'buy':'sell']+=p.lots;g.slope+=p.slope;}
  $('exposure-gross').textContent=`GROSS ${money(r.c.gross)}`;
  $('exposure-summary').innerHTML=`<span>Δ Equity / +1% общего сценария <strong class="${r.c.equitySlope<0?'negative':'positive'}">${signed(r.c.equitySlope*.01)} ${escape(state.account.currency)}</strong></span>`;
  $('exposure-rows').innerHTML=[...groups].map(([symbol,g])=>`<tr><td>${escape(symbol)}</td><td>${num(g.buy)}</td><td>${num(g.sell)}</td><td>${signed(g.buy-g.sell)}</td><td>${signed(g.slope*.01)}</td></tr>`).join('');
  const policies={gross:'Сумма маржи всех позиций',larger:'Маржа по большей стороне',hedged:'Хедж по коэффициенту спецификации'};
  $('margin-policy-note').textContent=state.account.marginSource==='terminal'?'Постоянная Used Margin · упрощенный расчет':policies[state.account.marginPolicy??'gross'];
}
function renderCritical(){
  const down=state.searchDown??99,up=state.searchUp??500;
  if(!Number.isFinite(down)||down<=0||down>=100||!Number.isFinite(up)||up<=0||up>100000){$('critical-rows').innerHTML='<tr><td colspan="4">Диапазон: вниз больше 0 и меньше 100%; вверх до 100 000%.</td></tr>';return;}
  const cell=(down,up,tick)=>{
    const r=down.kind==='reachable'||down.kind==='breached'?down:up;
    if(r.kind==='breached')return '<span class="negative">Уже достигнут</span>';
    if(r.kind==='no-margin')return 'Нет занятой маржи';
    if(r.kind!=='reachable')return '<span class="unreachable">Не достигается в диапазоне</span>';
    const digits=Math.min(10,Math.max(0,Math.ceil(-Math.log10(tick))));
    return `<strong>${num(r.price,digits)}</strong><small>${signed(r.delta,digits)} · ${signed(r.percent)}%</small>`;
  };
  $('critical-rows').innerHTML=criticalPrices(state,down,up).map(r=>{const digits=Math.min(10,Math.max(0,Math.ceil(-Math.log10(r.tick))));return `<tr><td><strong>${escape(r.symbol)}</strong><small>${escape(r.quote)} · шаг ${num(r.tick,digits)}</small></td><td>${num(r.reference,r.reference<10?5:2)}</td><td>${cell(r.callDown,r.callUp,r.tick)}</td><td>${cell(r.stopDown,r.stopUp,r.tick)}</td></tr>`;}).join('');
}
function compute() {
  const r=analyze(state);lastAnalysis=r;
  $('errors').hidden=!r.errors.length;
  if(r.errors.length){
    $('errors').innerHTML=`<strong>Проверьте исходные данные</strong><ul>${r.errors.map(e=>`<li>${escape(e)}</li>`).join('')}</ul>`;
    for(const id of ['equity-value','margin-value','free-value','level-value','equity-detail','leverage-value','call-value','call-detail','call-price','stop-value','stop-detail','stop-price'])$(id).textContent='—';
    $('status').textContent='Нет расчета';$('status').className='status no-margin';
    $('chart').innerHTML='<div class="invalid-placeholder">Исправьте исходные данные, чтобы построить карту риска.</div>';$('chart').onclick=null;
    $('stress-result').innerHTML='<p class="small-note">Стресс-тест будет доступен после исправления данных.</p>';$('scenario-rows').innerHTML='';
    $('exposure-rows').innerHTML='';$('exposure-summary').textContent='Исправьте исходные данные.';$('exposure-gross').textContent='—';$('critical-rows').innerHTML='';
    return;
  }
  $('equity-value').textContent=num(r.current.equity);$('equity-detail').textContent=`${state.account.currency} · ${state.account.mode==='equity'?'текущий Equity':'баланс + P&L + корректировки'}`;
  $('margin-value').textContent=num(r.current.margin);$('free-value').textContent=`Свободно: ${money(r.current.free)}`;
  $('level-value').textContent=percent(r.current.level);$('level-value').classList.toggle('mint',r.current.status==='normal');
  $('status').textContent=names[r.current.status];$('status').className=`status ${r.current.status}`;
  $('leverage-value').textContent=r.current.leverage!==null?`Нагрузка ${num(r.current.leverage,1)}×`:'';
  renderThreshold('call',r.call,r.c);renderThreshold('stop',r.stop,r.c);drawChart(r);renderStress(r);renderRows();renderExposure(r);renderCritical();persist();
}
function fullRender(){accountControls();renderPositions();compute();renderSaved();}
function setShock(value) {state.shock=value;syncShockControls();compute();}
function requireValid(){if(lastAnalysis?.errors.length){toast('Сначала исправьте исходные данные.');return false;}return true;}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function saveList(){try{localStorage.setItem(SAVED,JSON.stringify(saved));}catch{toast('Не удалось сохранить сценарий на устройстве. Используйте экспорт JSON.');}}
function renderSaved(){
  $('saved-section').hidden=!saved.length;
  $('saved-scenarios').innerHTML=saved.map(item=>{
    const r=analyze(item.state),stop=r.stop.kind==='reachable'?signed(r.stop.shock*100)+'%':r.stop.kind==='breached'?'Уже достигнут':r.stop.kind==='no-margin'?'Нет маржи':'Не достигается';
    return `<article class="saved-card panel"><h3>${escape(item.name)}</h3><div class="saved-meta">${item.state.positions.length} поз. · ${escape(item.state.account.currency)} · стресс ${signed(item.state.shock,1)}%</div><dl><dt>Equity</dt><dd>${num(r.current.equity)}</dd><dt>Маржа</dt><dd>${percent(r.current.level)}</dd><dt>Stop Out</dt><dd>${stop}</dd><dt>Стресс Equity</dt><dd>${r.stressed?num(r.stressed.equity):'Цена ≤ 0'}</dd></dl><div class="saved-actions"><button class="text-button mint" data-restore="${escape(item.id)}">Восстановить</button><button class="text-button" data-delete="${escape(item.id)}" aria-label="Удалить сценарий ${escape(item.name)}">Удалить</button></div></article>`;
  }).join('');
}
document.addEventListener('input',e=>{
  const el=e.target;
  if(el.dataset.account){const k=el.dataset.account;if(k==='currency')return;state.account[k]=el.value===''?NaN:Number(el.value);compute();}
  if(el.dataset.position&&el.tagName==='INPUT'){
    const p=state.positions.find(p=>p.id===el.closest('.position').dataset.id),k=el.dataset.position;
    p[k]=['symbol','quote'].includes(k)?el.value.toUpperCase():el.value===''?NaN:Number(el.value);
    if(k==='quote')p.conversion=p.quote===state.account.currency?1:NaN;
    if(k==='conversion'&&p.spec?.marginCurrency===p.quote)p.marginConversion=p.conversion;
    compute();
  }
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='currency'){
    state.account.currency=el.value;
    for(const p of state.positions){p.conversion=p.quote===el.value?1:NaN;if(p.spec)p.marginConversion=p.spec.marginCurrency===el.value?1:NaN;}
    accountControls();renderPositions();for(const d of document.querySelectorAll('.position details'))d.open=true;
    toast('Укажите курс конвертации для каждой валюты котировки.');compute();
  }
  if(el.hasAttribute('data-preset')){
    const p=state.positions.find(p=>p.id===el.closest('.position').dataset.id);
    if(el.value==='CUSTOM'){p.symbol='CUSTOM';renderPositions();const d=document.querySelector(`[data-id="${CSS.escape(p.id)}"] details`);d.open=true;d.querySelector('[data-position="symbol"]').focus();}
    else{Object.assign(p,instrumentSettings(findInstrument(el.value,state.brokerAccount),state.account.currency,state.brokerAccount??'mt4-real-ecn',p.side));renderPositions();compute();}
  }
  if(['marginMode','pnlMode'].includes(el.dataset.position)){
    state.positions.find(p=>p.id===el.closest('.position').dataset.id)[el.dataset.position]=el.value;renderPositions();compute();
  }
  if(['symbol','quote'].includes(el.dataset.position)){renderPositions();compute();}
});
$('capital-mode').onclick=e=>{const b=e.target.closest('[data-mode]');if(!b)return;const mode=b.dataset.mode;if(mode===state.account.mode)return;const r=analyze(state);if(!r.errors.length){if(mode==='balance')state.account.capital=r.current.equity-state.account.adjustment-r.c.positions.reduce((s,p)=>s+p.pnl,0);else state.account.capital=r.current.equity;}state.account.mode=mode;accountControls();renderPositions();compute();toast('Режим переключен с сохранением текущего Equity.');};
$('positions').onclick=e=>{
  const row=e.target.closest('.position');if(!row)return;const p=state.positions.find(p=>p.id===row.dataset.id);
  const side=e.target.closest('[data-side]');if(side){p.side=side.dataset.side;renderPositions();compute();}
  if(e.target.closest('[data-remove]')&&state.positions.length>1){state.positions=state.positions.filter(x=>x.id!==p.id);renderPositions();compute();}
  if(e.target.closest('[data-spec-view]'))openCatalog(p.symbol,p.id);
};
$('add-position').onclick=()=>{const profile=state.brokerAccount??'mt4-real-ecn',p=position(instrumentSettings(findInstrument('EURUSD',profile),state.account.currency,profile));state.positions.push(p);renderPositions();compute();const row=document.querySelector(`[data-id="${CSS.escape(p.id)}"]`);row.querySelector('select').focus();toast('Позиция добавлена. Цена и спецификация взяты из снимка.');};
$('shock').oninput=e=>setShock(Number(e.target.value));
$('shock-number').oninput=e=>{state.shock=e.target.value===''?NaN:Number(e.target.value);if(Number.isFinite(state.shock))syncShockControls();compute();};
$('zero-shock').onclick=()=>setShock(0);
for(const b of document.querySelectorAll('[data-shock]'))b.onclick=()=>setShock(Number(b.dataset.shock));
$('scenario-rows').onclick=e=>{const row=e.target.closest('[data-row-shock]');if(row)setShock(Number(row.dataset.rowShock));};
$('range').onchange=e=>{state.range=Number(e.target.value);syncShockControls();compute();};
$('theme').onclick=()=>{const light=document.documentElement.dataset.theme!=='light';document.documentElement.dataset.theme=light?'light':'dark';try{localStorage.setItem('margin-lab-theme',light?'light':'dark');}catch{}syncTheme();};
$('export').onclick=()=>{if(requireValid()){download('margin-lab-scenario.json',JSON.stringify(state,null,2),'application/json');toast('Сценарий экспортирован.');}};
$('import').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>150000)throw new Error('Максимальный размер файла — 150 КБ.');const next=readState(await file.text());state=next;fullRender();toast('Сценарий импортирован.');}catch(err){toast(`Импорт: ${err.message}`);}finally{e.target.value='';}
};
document.querySelector('.file-label').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('import').click();}};
$('reset').onclick=()=>{state=deskDemo();fullRender();toast('Демонстрационный пример восстановлен. Сохраненные сценарии доступны ниже.');};
$('csv').onclick=()=>{
  if(!requireValid())return;
  const rows=[['Market shock %',`Equity ${state.account.currency}`,`Margin ${state.account.currency}`,'Margin level %',`Free margin ${state.account.currency}`,'Status'],...scenarioRows(state).map(v=>[v.shock,v.valid?v.equity:'',v.valid?v.margin:'',v.valid?v.level??'':'',v.valid?v.free:'',v.valid?names[v.status]:'Invalid price'])];
  download('margin-lab-stress.csv','\ufeff'+rows.map(row=>row.map(x=>`"${String(x).replaceAll('"','""')}"`).join(';')).join('\r\n'),'text/csv;charset=utf-8');toast('Матрица сценариев экспортирована.');
};
$('share').onclick=()=>{
  if(!requireValid())return;
  const bytes=new TextEncoder().encode(JSON.stringify(state));let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  const url=new URL(location.href);url.hash='s='+btoa(binary);$('share-url').value=url.href;$('share-dialog').showModal();
};
$('close-share').onclick=()=>$('share-dialog').close();
$('copy-share').onclick=async()=>{try{await navigator.clipboard.writeText($('share-url').value);toast('Ссылка скопирована.');$('share-dialog').close();}catch{$('share-url').select();toast('Выделенная ссылка готова к ручному копированию.');}};
$('save-scenario').onclick=()=>{if(!requireValid())return;if(saved.length>=4){toast('Сохранено 4 сценария. Удалите один, чтобы добавить новый.');$('saved-section').scrollIntoView({behavior:'smooth'});return;}$('scenario-name').value=`Сценарий ${saved.length+1}`;$('save-dialog').showModal();$('scenario-name').select();};
$('close-save').onclick=()=>$('save-dialog').close();
$('save-form').onsubmit=e=>{e.preventDefault();const name=$('scenario-name').value.trim();if(!name)return;saved.push({id:crypto.randomUUID(),name,state:clone(state)});saveList();renderSaved();$('save-dialog').close();toast('Сценарий сохранен для сравнения.');};
$('saved-scenarios').onclick=e=>{const restore=e.target.closest('[data-restore]'),del=e.target.closest('[data-delete]');if(restore){const item=saved.find(x=>x.id===restore.dataset.restore);state=clone(item.state);fullRender();$('main').scrollIntoView({behavior:'smooth'});toast(`Восстановлен сценарий «${item.name}».`);}if(del){saved=saved.filter(x=>x.id!==del.dataset.delete);saveList();renderSaved();}};
$('clear-saved').onclick=()=>{saved=[];saveList();renderSaved();toast('Сохраненные сценарии удалены.');};
$('print').onclick=()=>window.print();
$('settings-help').onclick=()=>$('legend-dialog').showModal();
$('close-legend').onclick=()=>$('legend-dialog').close();
$('legend-done').onclick=()=>$('legend-dialog').close();
let catalogTarget=null,inspected='EURUSD';
function openCatalog(symbol='EURUSD',target=null){catalogTarget=target;inspected=symbol;$('catalog-search').value='';$('catalog-category').value='';$('catalog-profile').value=state.brokerAccount??'mt4-real-ecn';renderCatalog();$('catalog-dialog').showModal();}
function renderCatalog(){
  const profile=$('catalog-profile').value,search=$('catalog-search').value.trim().toLowerCase(),category=$('catalog-category').value;
  const all=catalog(profile),list=all.filter(p=>(!category||p.category===category)&&(!search||(p.symbol+' '+p.description).toLowerCase().includes(search)));
  $('catalog-source').textContent=`${list.length} из ${all.length} инструментов · ${accountNames[profile]} · снимок ${new Date(marketData.capturedAt).toLocaleDateString('ru-RU')}. Котировки не обновляются онлайн.`;
  $('catalog-rows').innerHTML=list.map(p=>`<tr><td><button class="symbol-detail" data-inspect="${escape(p.symbol)}">${escape(p.symbol)}</button><small>${escape(p.description)}</small></td><td>${num(p.contract,0)}</td><td>${p.lotMin} / ${p.lotStep}</td><td>${p.marginMode===0?`FX / плечо / ${p.marginDivider}`:`CFD / ${p.marginDivider}`}</td><td><button class="text-button mint" data-catalog-add="${escape(p.symbol)}">${catalogTarget?'Применить':'Добавить'}</button></td></tr>`).join('')||'<tr><td colspan="5">Инструменты не найдены. Измените фильтр.</td></tr>';
  const p=findInstrument(inspected,profile)??list[0];if(!p){$('catalog-detail').textContent='Нет выбранного инструмента';return;}
  const day={0:'Воскресенье',1:'Понедельник',2:'Вторник',3:'Среда',4:'Четверг',5:'Пятница',6:'Суббота'};
  const fields=[['Класс активов',categoryNames[p.category]],['Контракт',num(p.contract,0)],['Валюта P&L',p.profitCurrency],['Валюта маржи',p.marginCurrency],['Модель маржи',specMarginLabel(p)],['Мин. / макс. лот',`${p.lotMin} / ${p.lotMax}`],['Шаг лота',p.lotStep],['Разрядность',p.digits],['Шаг цены',p.point],['Bid · снимок',num(p.bid,p.digits)],['Ask · снимок',num(p.ask,p.digits)],['Hedged Margin',p.hedgedMargin],['Коэффициент хеджа',p.hedgedMargin/p.contract],['Комиссия · снимок',`${p.commission}${p.commissionType===2?'%':' /лот'}`],['Swap long / short',`${p.swapLong} / ${p.swapShort}`],['Режим swap',({0:'Пункты',1:'В базовой валюте',2:'В валюте маржи',3:'% от цены'})[p.swapType]??'Не указан'],['Тройной swap',day[p.tripleSwapDay]??'Не указан'],['Доступность',p.tradeMode===2?'Полная торговля':p.tradeMode===1?'Только закрытие':'Торговля выключена']];
  $('catalog-detail').innerHTML=`<span class="tag">${escape(accountNames[profile])}</span><h3>${escape(p.symbol)}</h3><p>${escape(p.description)}</p><dl>${fields.map(([k,v])=>`<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl><p class="small-note">Комиссии и своп показаны для справки. Они не начисляются автоматически; накопленные суммы вводятся в позиции. Спецификации MT4 не выдаются за параметры групп MT5.</p>`;
}
$('open-catalog').onclick=()=>openCatalog();$('close-catalog').onclick=()=>$('catalog-dialog').close();
$('catalog-search').oninput=renderCatalog;$('catalog-category').onchange=renderCatalog;$('catalog-profile').onchange=renderCatalog;
$('catalog-rows').onclick=e=>{const inspect=e.target.closest('[data-inspect]'),add=e.target.closest('[data-catalog-add]');if(inspect){inspected=inspect.dataset.inspect;renderCatalog();}if(add){const profile=$('catalog-profile').value,spec=findInstrument(add.dataset.catalogAdd,profile);let p=catalogTarget?state.positions.find(x=>x.id===catalogTarget):null;if(!p){p=position();state.positions.push(p);}Object.assign(p,instrumentSettings(spec,state.account.currency,profile,p.side));state.brokerAccount=profile;fullRender();$('catalog-dialog').close();toast(`${spec.symbol}: параметры ${accountNames[profile]} применены. Проверьте текущую цену.`);}};
$('broker-profile').onchange=e=>{state.brokerAccount=e.target.value;persist();toast('Профиль выбран для следующих инструментов. Уже введенные позиции сохраняют свою спецификацию.');};
$('account-label').oninput=e=>{state.account.label=e.target.value;persist();};
$('margin-source').onchange=e=>{state.account.marginSource=e.target.value;if(!Number.isFinite(state.account.usedMargin))state.account.usedMargin=lastAnalysis?.current?.margin??1000;accountControls();compute();};
$('margin-policy').onchange=e=>{state.account.marginPolicy=e.target.value;compute();};
$('threshold-unit').onchange=e=>{state.account.thresholdUnit=e.target.value;accountControls();compute();};
for(const id of ['search-down','search-up'])$(id).oninput=e=>{state[id==='search-down'?'searchDown':'searchUp']=e.target.value===''?NaN:Number(e.target.value);renderCritical();persist();};
$('connect-client').onclick=()=>$('portfolio-dialog').showModal();$('close-portfolio').onclick=()=>$('portfolio-dialog').close();
$('csv-template').onclick=()=>download('margin-lab-positions-template.csv','\ufeff'+csvTemplate,'text/csv;charset=utf-8');
$('portfolio-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>2000000)throw Error('Максимальный размер CSV — 2 МБ.');const next=clone(state);next.positions=parseCsv(await file.text());const errors=validate(next);if(errors.length)throw Error(errors.slice(0,5).join(' '));state=next;fullRender();$('portfolio-error').hidden=true;$('portfolio-dialog').close();toast(`Импортировано ${state.positions.length} позиций. Параметры счета сохранены.`);}catch(err){$('portfolio-error').hidden=false;$('portfolio-error').textContent=err.message;}finally{e.target.value='';}
};
syncTheme();fullRender();
new ResizeObserver(()=>{if(lastAnalysis&&!lastAnalysis.errors.length)drawChart(lastAnalysis);}).observe($('chart'));
