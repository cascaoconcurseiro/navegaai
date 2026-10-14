// A verified skill is a reusable *instruction template*, not blindly replayed DOM clicks.
// Never retain page snapshots, passwords, model outputs or typed form data.
const STORE='navegaSkillsV1';
export function makeSkill({origin,prompt,verifiedProofs=0,sourceRunId}){
 const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||origin!==url.origin)throw Error('Origem inválida.');
 const instruction=String(prompt||'').trim();if(!instruction||instruction.length>1800)throw Error('Instrução inválida.');
 if(/(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:senha|password|token|api.?key|chave privada|cvv|cpf|c[oó]digo de acesso)\b|sk-[a-zA-Z0-9-]{6,})/i.test(instruction))throw Error('Pedido potencialmente sensível: não criar habilidade automática.');
 if(!Number.isInteger(verifiedProofs)||verifiedProofs<1)throw Error('O procedimento não possui evidência de verificação.');
 return {id:crypto.randomUUID(),title:instruction.slice(0,68),origin,instruction,verifiedProofs,sourceRunId:String(sourceRunId||'').slice(0,80),createdAt:Date.now(),status:'suggested'};
}
export async function suggestSkill(storage,input){const skill=makeSkill(input);const old=(await storage.get(STORE))[STORE]||[];
 if(old.some(x=>x.origin===skill.origin&&x.instruction===skill.instruction))return null;
 await storage.set({[STORE]:[skill,...old].slice(0,100)});return skill;
}
export async function listSkills(storage,origin=''){const rows=(await storage.get(STORE))[STORE]||[];return origin?rows.filter(x=>x.origin===origin):rows;}
export async function approveSkill(storage,id){const list=await listSkills(storage),s=list.find(x=>x.id===id);
 if(!s)throw Error('Habilidade não encontrada.');s.status='approved';s.approvedAt=Date.now();await storage.set({[STORE]:list});return s;
}
export async function removeSkill(storage,id){const rows=await listSkills(storage);await storage.set({[STORE]:rows.filter(x=>x.id!==id)});}
