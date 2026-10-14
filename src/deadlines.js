// Explicit deadlines ensure browser automation cannot wait forever on a
// disconnected frame/service. A timed-out mutation is INDETERMINATE, not failed
// safely: it must NEVER be replayed without inspecting the site's state.
export async function withDeadline(promise, ms, label='operation') {
  if(!Number.isFinite(ms)||ms<1)throw Error('Prazo inválido.');
  let timeout;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error(`TIMEOUT_INDETERMINADO: ${label} não respondeu em ${ms} ms; o site ainda pode ter executado o comando.`)),ms);})
    ]);
  } finally{clearTimeout(timeout);}
}
