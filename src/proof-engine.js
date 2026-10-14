// Each verification is bound to the last action issued by this adapter instance.
// Local form updates are not equivalent to successful external submissions.
export class ProofLedger {
  constructor(){this.actions=[];this.proofs=[];this.weakEvidence=[];}
  dispatched({stepId,name,risk,actionToken=null,localConfirmed=false}){
    const action={stepId,name,risk,actionToken,proof:null};
    this.actions.push(action);
    if(localConfirmed && ['fill_element','select_option'].includes(name)){
      action.proof={stepId,evidence:'local_value_confirmed'};
      this.proofs.push({actionStepId:stepId,proofStepId:stepId,evidence:'local_value_confirmed'});
    }
    return action;
  }
  evaluate(result,stepId){
    if(result?.verified!==true)return {accepted:false,reason:'criterion_not_satisfied'};
    const pending=this.actions.filter(a=>!a.proof);
    const action=pending.at(-1);
    if(!action){this.weakEvidence.push({stepId,evidence:'not_linked_to_action'});return {accepted:false,reason:'no_pending_action'};}
    // Simulated tools must present the token for their corresponding dispatch too.
    if(!action.actionToken || !result.actionToken || action.actionToken!==result.actionToken){
      this.weakEvidence.push({stepId,evidence:'action_mismatch',actionStepId:action.stepId});
      return {accepted:false,reason:'action_mismatch'};
    }
    if(result.evidence!=='changed_state'){
      this.weakEvidence.push({stepId,evidence:result.evidence||'unspecified',actionStepId:action.stepId});
      return {accepted:false,reason:'weak_evidence'};
    }
    action.proof={stepId,evidence:result.evidence};
    this.proofs.push({actionStepId:action.stepId,proofStepId:stepId,evidence:result.evidence});
    return {accepted:true,actionStepId:action.stepId};
  }
  summary(){
    const unverified=this.actions.filter(a=>!a.proof);
    const pendingSet=new Set(unverified.map(a=>a.stepId));
    return {actionCount:this.actions.length,proofCount:this.proofs.length,
      unverifiedCount:unverified.length,unverifiedSteps:unverified.map(a=>a.stepId),
      localProofCount:this.proofs.filter(x=>x.evidence==='local_value_confirmed').length,
      weakEvidenceCount:this.weakEvidence.length,
      unresolvedWeakEvidenceCount:this.weakEvidence.filter(e=>e.actionStepId&&pendingSet.has(e.actionStepId)).length};
  }
}
