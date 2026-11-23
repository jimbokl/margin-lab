import {position} from './engine.js';
export function parseCsv(text) {
  text=text.replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/,1)[0],delimiter=first.includes(';')?';':',';
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<=text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if((ch===delimiter||ch==='\n'||ch===undefined)&&!quoted){row.push(cell.replace(/\r$/,''));cell='';if(ch!==delimiter){if(row.some(x=>x.trim()))rows.push(row);row=[];}}
    else if(ch!==undefined)cell+=ch;
  }
  if(quoted)throw Error('Незакрытая кавычка в CSV.');
  if(rows.length<2)throw Error('CSV должен содержать заголовок и хотя бы одну позицию.');
  const header=rows.shift().map(x=>x.trim());
  const required=['symbol','side','lots','entry','price','contract','quote','conversion'];
  if(required.some(x=>!header.includes(x)))throw Error('Нужны столбцы: '+required.join(', '));
  if(new Set(header).size!==header.length)throw Error('Повторяющиеся заголовки CSV.');
  return rows.map((row,i)=>{
    if(row.length!==header.length)throw Error(`Строка ${i+2}: число ячеек не соответствует заголовкам.`);
    const data=Object.fromEntries(header.map((k,j)=>[k,row[j].trim()])),p=position();
    for(const key of ['symbol','side','quote'])p[key]=data[key].toUpperCase();
    for(const key of ['lots','entry','price','contract','conversion','swap','commission','tick','moneyPerPrice'])if(data[key]!==undefined){const raw=data[key].replace(',','.');if(!raw)throw Error(`Строка ${i+2}: поле ${key} пустое.`);p[key]=Number(raw);if(!Number.isFinite(p[key]))throw Error(`Строка ${i+2}: ${key} — не число.`);}
    if(data.moneyPerPrice)p.pnlMode='custom';
    p.marginMode='fixed';return p;
  });
}
export const csvTemplate='symbol;side;lots;entry;price;contract;quote;conversion;swap;commission;tick\r\nEURUSD;BUY;1;1.08;1.085;100000;USD;1;-10;-5;0.00001\r\nEURUSD;SELL;0.5;1.09;1.085;100000;USD;1;3;-2.5;0.00001\r\nXAUUSD;BUY;0.1;2600;2650;100;USD;1;-2;-0.5;0.01\r\n';
