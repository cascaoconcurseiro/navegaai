// Five-field POSIX-like syntax: minute hour day-of-month month day-of-week.
// No seconds, aliases, L/W/#, or named months; DOM/DOW both restricted = OR.
const ranges=[[0,59],[0,23],[1,31],[1,12],[0,6]];
export function parseCron(expr){
  const fields=String(expr||'').trim().split(/\s+/);
  if(fields.length!==5)throw Error('Cron exige 5 campos: minuto hora dia mês semana.');
  return fields.map((part,index)=>{
    const [min,max]=ranges[index], values=new Set();
    for(const piece of part.split(',')){
      const chunks=piece.split('/');if(chunks.length>2)throw Error('Sintaxe cron inválida.');
      const step=chunks[1]===undefined?1:Number(chunks[1]);if(!Number.isInteger(step)||step<1)throw Error('Intervalo cron inválido.');
      const base=chunks[0];let start,end;
      if(base==='*'){start=min;end=max;}
      else if(/^\d+-\d+$/.test(base)){[start,end]=base.split('-').map(Number);}
      else if(/^\d+$/.test(base)){start=Number(base);end=chunks.length===2?max:start;}
      else throw Error('Campo cron inválido: '+piece);
      if(start<min||end>max||start>end)throw Error('Campo cron fora do intervalo: '+piece);
      for(let x=start;x<=end;x+=step)values.add(x);
    }
    if(!values.size) throw Error('Campo cron vazio.');
    return {values,any:part==='*'};
  });
}
export function matchesCron(parts,d){
  const [min,hour,day,month,week]=parts;
  if(!min.values.has(d.getMinutes())||!hour.values.has(d.getHours())||!month.values.has(d.getMonth()+1))return false;
  const dom=day.values.has(d.getDate()),dow=week.values.has(d.getDay());
  return day.any&&week.any ? true : day.any?dow : week.any?dom : dom||dow;
}
export function nextCron(expr,after=new Date()){
  const parsed=parseCron(expr);
  // Local-time scheduling; DST gaps handled by searching real instants.
  const base=Math.floor(after.getTime()/60000)*60000+60000;
  for(let k=0;k<366*24*60*2;k++) {const d=new Date(base+k*60000);if(matchesCron(parsed,d))return d.getTime();}
  throw Error('Não foi encontrada próxima execução em 2 anos.');
}
export function validateJob(job){
  if(!String(job.prompt||'').trim()||String(job.prompt).length>1600)throw Error('Descreva uma tarefa com até 1600 caracteres.');
  nextCron(job.cron);if(!Number.isInteger(job.tabId)||job.tabId<1)throw Error('Aba inválida.');
  if(!/^https?:\/\//.test(job.origin||''))throw Error('Origem inválida.');
  return {...job,prompt:String(job.prompt).trim()};
}
