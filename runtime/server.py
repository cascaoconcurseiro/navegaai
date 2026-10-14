"""Loopback-only API for NavegaAI's optional, isolated desktop runtime."""
from __future__ import annotations
import os
import secrets
import re
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from .core import Runtime

DATA=Path(os.environ.get('NAVEGA_RUNTIME_DATA', str(Path.home()/'.navegaai-runtime')))
def load_local_token(data_dir):
    # Stable across restarts; generated once in a private local file.
    explicit=os.environ.get('NAVEGA_RUNTIME_TOKEN')
    if explicit:
        if len(explicit)<32:raise RuntimeError('NAVEGA_RUNTIME_TOKEN precisa de pelo menos 32 caracteres.')
        return explicit
    data_dir.mkdir(parents=True,exist_ok=True)
    try:os.chmod(data_dir,0o700)
    except OSError:pass
    path=data_dir/'access.token'
    try:
        token=path.read_text(encoding='ascii').strip()
        if len(token)<32:raise RuntimeError('Token local armazenado é inválido.')
        return token
    except FileNotFoundError:
        fresh=secrets.token_urlsafe(40)
        try:
            fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        except FileExistsError:
            return load_local_token(data_dir)
        with os.fdopen(fd,'w',encoding='ascii') as stream:
            stream.write(fresh+'\n')
        return fresh

TOKEN=load_local_token(DATA)
ENGINE=Runtime(DATA/'state.sqlite3',DATA/'profile',headless=os.environ.get('NAVEGA_HEADLESS')=='1')

@asynccontextmanager
async def lifespan(app):
    # Lazy browser startup permits health checks without launching Chromium.
    yield
    await ENGINE.shutdown()

app=FastAPI(title='NavegaAI Desktop Runtime',docs_url=None,redoc_url=None,openapi_url=None,lifespan=lifespan)

@app.middleware('http')
async def security(request:Request,call_next):
    # Protect against DNS rebinding and browser cross-origin requests.
    host=request.headers.get('host','').split(':')[0].lower()
    if host not in ('127.0.0.1','localhost'):
        return JSONResponse({'detail':'Acesso somente pelo endereço de loopback.'},status_code=403)
    origin=request.headers.get('origin','')
    extension_origin=bool(re.fullmatch(r'chrome-extension://[a-p]{32}',origin))
    allowed_origin=os.environ.get('NAVEGA_EXTENSION_ORIGIN','')
    origin_ok = (origin==allowed_origin) if allowed_origin else extension_origin
    if origin and not origin_ok:
        return JSONResponse({'detail':'Origem do navegador não autorizada.'},status_code=403)
    if request.method=='OPTIONS':
        response=JSONResponse({},status_code=204)
    else:
        response=await call_next(request)
    if origin and origin_ok:
        response.headers['Access-Control-Allow-Origin']=origin
        response.headers['Access-Control-Allow-Headers']='authorization,content-type'
        response.headers['Access-Control-Allow-Methods']='GET,POST,OPTIONS'
        response.headers['Vary']='Origin'
    return response

async def auth(authorization: str|None):
    expected='Bearer '+TOKEN
    if not authorization or not secrets.compare_digest(authorization,expected):
        raise HTTPException(401,'Token local inválido.')

class DecisionRequest(BaseModel):
    request_id: str = Field(min_length=32,max_length=64)
    decision: str

class TaskRequest(BaseModel):
    workspace:str=Field(min_length=1,max_length=128)
    prompt:str=Field(min_length=1,max_length=12000)
    url:str
    model:str
    base_url:str='https://openrouter.ai/api/v1'
    api_key:str=Field(default='',repr=False)
    approval_mode:str='read_only'
    allowed_origins:list[str]=Field(default_factory=list,max_length=20)
    allow_sensitive:bool=False
    vision_enabled:bool=False
    client_job_id:str|None=None
    resume_of:str|None=None

@app.get('/health')
async def health(authorization: str|None=Header(default=None)):
    await auth(authorization)
    return {'ok':True,'service':'NavegaAI Desktop Runtime','version':'4.0-rc.1','isolation':'managed_profile'}

@app.post('/tasks')
async def tasks(req:TaskRequest,authorization:str|None=Header(default=None)):
    await auth(authorization)
    try:
        job=await ENGINE.submit(**req.model_dump())
    except ValueError as e:raise HTTPException(422,str(e))
    return {'id':job,'status':'queued'}

@app.get('/tasks/{id}')
async def task(id:str,authorization:str|None=Header(default=None)):
    await auth(authorization)
    found=ENGINE.status(id)
    if not found:raise HTTPException(404,'Tarefa não encontrada.')
    return found

@app.post('/tasks/{id}/decision')
async def decision(id:str,req:DecisionRequest,authorization:str|None=Header(default=None)):
    await auth(authorization)
    if not ENGINE.status(id):raise HTTPException(404,'Tarefa não encontrada.')
    try:ENGINE.decide(id,req.request_id,req.decision)
    except ValueError as e:raise HTTPException(409,str(e))
    return {'ok':True}

@app.get('/tasks/{id}/audit-integrity')
async def audit_integrity(id:str,authorization:str|None=Header(default=None)):
    await auth(authorization)
    if not ENGINE.status(id):raise HTTPException(404,'Tarefa não encontrada.')
    return {'ok':ENGINE.store.verify_chain(id)}

@app.post('/tasks/{id}/cancel')
async def cancel(id:str,authorization:str|None=Header(default=None)):
    await auth(authorization)
    if not ENGINE.status(id):raise HTTPException(404,'Tarefa não encontrada.')
    return {'cancel_requested':ENGINE.cancel(id)}

if __name__=='__main__':
    import uvicorn
    print('NAVEGAAI RUNTIME TOKEN (guarde em segredo):',TOKEN,flush=True)
    uvicorn.run(app,host='127.0.0.1',port=int(os.environ.get('NAVEGA_RUNTIME_PORT','8765')))
