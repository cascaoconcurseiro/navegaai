"""Regression tests for security and durability changes in the next runtime."""
import asyncio
import tempfile
import unittest
from pathlib import Path
from runtime.core import Runtime

class Page:
    url='https://example.com/'

class Context:
    def __init__(self):
        self.closed=False
        self.pages=[]
    async def new_page(self):
        p=Page()
        self.pages.append(p)
        return p
    async def close(self):
        self.closed=True

class IsolationTests(unittest.IsolatedAsyncioTestCase):
    async def test_distinct_workspace_contexts_not_shared(self):
        with tempfile.TemporaryDirectory() as root:
            instances=[]
            async def make_context():
                instance=Context();instances.append(instance)
                return instance
            rt=Runtime(Path(root)/'db',Path(root)/'profiles',browser_factory=make_context)
            try:
                a,b=await asyncio.gather(rt.ensure_browser('gmail'),rt.ensure_browser('bank'))
                assert a is not b
                assert await rt.ensure_browser('gmail') is a
                assert await rt.ensure_browser('bank') is b
                self.assertEqual(len(instances),2)
                self.assertEqual(len(rt.contexts),2)
            finally:await rt.shutdown()
            self.assertTrue(all(c.closed for c in instances))

    async def test_resume_requires_same_workspace_paused_job(self):
        with tempfile.TemporaryDirectory() as root:
            rt=Runtime(Path(root)/'db',Path(root)/'profile')
            try:
                rt.store.create('a'*32,'gmail','Envie e-mail','x','https://example.com')
                rt.store.set('a'*32,status='interrupted')
                called=asyncio.Event()
                async def dummy(*args,**kwargs):
                    called.set()
                    await asyncio.sleep(10)
                rt._run=dummy
                options=dict(workspace='gmail',prompt='continue',url='https://example.com',
                             model='x',base_url='https://openrouter.ai/api/v1',api_key='test',approval_mode='auto')
                job=await rt.submit(**options,resume_of='a'*32)
                saved=rt.store.job(job)
                self.assertIn('OBJETIVO ANTERIOR: Envie e-mail',saved['prompt'])
                self.assertIn('NÃO repita',saved['prompt'])
                self.assertIn('resume_requested',[e['event'] for e in rt.store.events(job)])
                with self.assertRaises(ValueError):
                    await rt.submit(**{**options,'workspace':'different'},resume_of='a'*32)
            finally:await rt.shutdown()

class AutoApprovalTests(unittest.IsolatedAsyncioTestCase):
    async def test_auto_requires_consent_for_sensitive_click(self):
        with tempfile.TemporaryDirectory() as root:
            rt=Runtime(Path(root)/'db',Path(root)/'profile')
            sent=[]
            async def page(workspace,url):return Page()
            async def observe(p):return {'url':p.url,'snapshot':'- button "Enviar"'}
            async def act(page,name,args,mode,allowed,sensitive_ok,baseline):
                sent.append((name,mode))
                return {'ok':True,'effect':'observed_change'},True
            n=0
            async def llm(model,messages,tools):
                nonlocal n
                n+=1
                if n==1:
                    return {'content':'','tool_calls':[{'id':'1','type':'function','function':
                        {'name':'click','arguments':'{"role":"button","name":"Enviar"}'}}]}
                return {'content':'Revise conclusão','tool_calls':[]}
            rt._page=page;rt._observe=observe;rt._action=act;rt.model_client=llm
            try:
                job=await rt.submit(workspace='mail',prompt='Envie um teste',url='https://example.com',
                   model='fixture',base_url='https://openrouter.ai/api/v1',api_key='unused',approval_mode='auto')
                for i in range(300):
                    status=rt.status(job)
                    if status['approval']:break
                    await asyncio.sleep(0.005)
                else:self.fail('Auto mode did not request high-risk approval')
                self.assertEqual(sent,[])
                rt.decide(job,status['approval']['requestId'],'approve')
                await rt.tasks[job]
                self.assertEqual(sent,[('click','approved_once')])
            finally:await rt.shutdown()

if __name__=='__main__':unittest.main()

class CheckpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_same_request_idempotent_after_checkpoint_url_changes(self):
        with tempfile.TemporaryDirectory() as root:
            rt=Runtime(Path(root)/'db',Path(root)/'profiles')
            async def run(*args,**kwargs):await asyncio.sleep(30)
            rt._run=run
            try:
                request=dict(workspace='mail',prompt='Leia caixa',url='https://example.com/start',
                             model='m',base_url='https://openrouter.ai/api/v1',api_key='token',client_job_id='a'*32)
                job=await rt.submit(**request)
                rt.store.set(job,url='https://example.com/inbox')
                self.assertEqual(await rt.submit(**request),job)
            finally:await rt.shutdown()

class NetworkAndTokenTests(unittest.IsolatedAsyncioTestCase):
    async def test_navigation_is_preemptively_blocked(self):
        with tempfile.TemporaryDirectory() as root:
            class Context:
                async def route(self,pattern,handler):self.handler=handler
                async def close(self):pass
            context=Context()
            async def factory():return context
            rt=Runtime(Path(root)/'db',Path(root)/'profile',browser_factory=factory)
            try:
                await rt.ensure_browser('workspace')
                rt.workspace_allowed['workspace']={'https://approved.example'}
                class Request:
                    def __init__(self,url,nav=True):self.url=url;self.nav=nav
                    def is_navigation_request(self):return self.nav
                class Route:
                    def __init__(self,req):self.request=req;self.result=None
                    async def abort(self,*args):self.result='blocked'
                    async def continue_(self):self.result='continued'
                denied=Route(Request('https://unexpected.example/login'))
                await context.handler(denied)
                self.assertEqual(denied.result,'blocked')
                permitted=Route(Request('https://approved.example/inbox'))
                await context.handler(permitted)
                self.assertEqual(permitted.result,'continued')
                css=Route(Request('https://cdn.example/css',False))
                await context.handler(css)
                self.assertEqual(css.result,'continued')
            finally:await rt.shutdown()

    def test_local_token_remains_stable_across_restart(self):
        from runtime.server import load_local_token
        with tempfile.TemporaryDirectory() as root:
            import os
            old=os.environ.pop('NAVEGA_RUNTIME_TOKEN',None)
            try:
                first=load_local_token(Path(root))
                second=load_local_token(Path(root))
                self.assertEqual(first,second)
                self.assertGreaterEqual(len(first),32)
            finally:
                if old is not None:os.environ['NAVEGA_RUNTIME_TOKEN']=old
