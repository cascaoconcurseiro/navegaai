// After an MV3 worker restart, pending tool dispatches are INDETERMINATE.
// Never replay them automatically: the site may already have applied changes.
export function inspectInterruptedRun(events=[],runId){
  const relevant=events.filter(e=>e?.runId===runId);
  const starts=new Map();const finals=new Set();
  for(const event of relevant){
    const id=event.stepId;
    if(!id||typeof id!=='string')continue;
    if(event.event==='agent_tool_start')starts.set(id,{stepId:id,name:String(event.name||'unknown')});
    if(['agent_tool_success','agent_tool_error'].includes(event.event))finals.add(id);
  }
  const indeterminate=[...starts.values()].filter(entry=>!finals.has(entry.stepId));
  const finished=relevant.some(e=>e.event==='run_finished');
  return {finished,indeterminate,actionMayHaveOccurred:indeterminate.some(e=>!['get_page','verify_page','capture_viewport'].includes(e.name))};
}
