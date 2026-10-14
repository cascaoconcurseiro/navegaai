// Tamper-evident chain (not a cryptographic signature): sensitive content is redacted.
const KEY='navegaAuditV3';const MAX_RECORDS=1000;
export function redact(value,depth=0){
  if(depth>6)return '[limite]';
  if(typeof value==='string') return value.replace(/sk-[\w-]{8,}|Bearer\s+[\w.\-]+|(?:api[_ -]?key|token|senha|password|secret)\s*[:=]\s*\S+/gi,'[oculto]').slice(0,600);
  if(Array.isArray(value)) return value.slice(0,25).map(x=>redact(x,depth+1));
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,20).map(([k,v])=>[k,/(?:key|token|secret|password|authorization|cookie|text|content|prompt|result|history|args)/i.test(k)?'[redigido]':redact(v,depth+1)]));
  return value;
}
export async function sha256(text){const bytes=new TextEncoder().encode(text);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');}
// IndexedDB prevents rewriting a 1000-entry array for every tool action.
// Legacy chrome.storage.local audit is retained and migrated once on first access.
let databasePromise;
function idbSupported(){return typeof indexedDB!=='undefined'&&typeof indexedDB.open==='function';}
function openAuditDb(){
 if(!idbSupported())return Promise.resolve(null);
 if(!databasePromise)databasePromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open('navegaai-audit-v1',1);
  request.onupgradeneeded=()=>{const db=request.result;const rows=db.createObjectStore('records',{keyPath:'seq'});rows.createIndex('runId','runId',{unique:false});rows.createIndex('tabId','tabId',{unique:false});};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
 return databasePromise;
}
function getRows(db){return new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly');const r=tx.objectStore('records').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}
function lastRow(db){return new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly');const r=tx.objectStore('records').openCursor(null,'prev');r.onsuccess=()=>resolve(r.result?.value||null);r.onerror=()=>reject(r.error);});}
function persistRows(db,rows){return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');const store=tx.objectStore('records');for(const row of rows)store.put(row);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
async function getPersistentDatabase(storage){
 const db=await openAuditDb();if(!db)return null;
 // Migration is idempotent, and preserves the hash chain created in prior versions.
 const last=await lastRow(db);
 if(!last){const old=(await storage.get(KEY))[KEY];if(Array.isArray(old)&&old.length)await persistRows(db,old);}
 return db;
}
// A single append queue prevents concurrent writers from reading the same last row
// and producing colliding sequence numbers or broken hash chains.
let auditWriteTail=Promise.resolve();
export function appendAudit(storage,entry){
  const write=auditWriteTail.catch(()=>{}).then(()=>appendAuditSerial(storage,entry));
  auditWriteTail=write.catch(()=>{});
  return write;
}
async function appendAuditSerial(storage,entry){
 const db=await getPersistentDatabase(storage);
 if(db){
  const last=await lastRow(db);
  const record={seq:(last?.seq||0)+1,at:new Date().toISOString(),...redact(entry),prevHash:last?.hash||'genesis'};
  record.hash=await sha256(JSON.stringify(record));await persistRows(db,[record]);
  // Retain up to 5000 records; oldest hashes remain verifiable relative to the first retained entry.
  if(record.seq>5000){try{const tx=db.transaction('records','readwrite');tx.objectStore('records').delete(record.seq-5000);}catch{}}
  return record;
 }
 // Node tests / legacy browsers: bounded storage fallback.
 const saved=await storage.get(KEY);let rows=Array.isArray(saved[KEY])?saved[KEY]:[];
 const previous=rows.at(-1)?.hash || 'genesis';
 const record={seq:(rows.at(-1)?.seq||0)+1,at:new Date().toISOString(),...redact(entry),prevHash:previous};
 record.hash=await sha256(JSON.stringify(record));rows=[...rows.slice(-(MAX_RECORDS-1)),record];
 await storage.set({[KEY]:rows});return record;
}
export async function getAudit(storage){
 const db=await getPersistentDatabase(storage);
 return db?getRows(db):(await storage.get(KEY))[KEY]||[];
}
// Targeted timeline lookup: avoids fetching every user's run for each panel refresh.
export async function getAuditByTab(storage,tabId,limit=1200){
 if(!Number.isInteger(tabId)||tabId<1)throw Error('Aba inválida.');
 const db=await getPersistentDatabase(storage);
 if(!db)return (await getAudit(storage)).filter(e=>e.tabId===tabId).slice(-limit);
 return await new Promise((resolve,reject)=>{
  const tx=db.transaction('records','readonly');
  const index=tx.objectStore('records').index('tabId');
  const req=index.openCursor(IDBKeyRange.only(tabId),'prev');const result=[];
  req.onsuccess=()=>{const cursor=req.result;if(!cursor||result.length>=limit){resolve(result.reverse());return;}
   result.push(cursor.value);cursor.continue();};
  req.onerror=()=>reject(req.error);
 });
}
export async function verifyAudit(rows){
  for(let i=0;i<rows.length;i++){
    const {hash,...rest}=rows[i];if(await sha256(JSON.stringify(rest))!==hash)return false;
    if(i&&rows[i].prevHash!==rows[i-1].hash)return false;
  }return true;
}
