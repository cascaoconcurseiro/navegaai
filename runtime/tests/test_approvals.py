"""Real async approval gates; no API provider or remote website needed."""
import asyncio
import tempfile
import unittest
from pathlib import Path
from runtime.core import Runtime, ApprovalDeclined

class Page:
    url='https://example.com/'

class Approvals(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.rt=Runtime(Path(self.temp.name)/'db.sqlite',Path(self.temp.name)/'profile')
        self.sent=[]
        self.calls=0
        async def page(workspace,url):return Page()
        async def observe(p):return {'url':p.url,'snapshot':'- button "Continuar"'}
        async def action(page,name,args,mode,allowed,sensitive_ok,baseline):
            self.sent.append(name)
            return {'ok':True,'effect':'observed_change'},name=='click'
        async def model(model,messages,tools):
            self.calls+=1
            if self.calls==1:
                return {'content':'','tool_calls':[{'id':'c1','type':'function','function':{'name':'click','arguments':'{"role":"button","name":"Continuar"}'}}]}
            return {'content':'Operação realizada','tool_calls':[]}
        self.rt._page=page
        self.rt._observe=observe
        self.rt._action=action
        self.rt.model_client=model

    async def asyncTearDown(self):
        await self.rt.shutdown()
        self.temp.cleanup()

    async def launch(self):
        job=await self.rt.submit(workspace='a',prompt='Clique em Continuar',url='https://example.com/',
             model='fixture',base_url='https://openrouter.ai/api/v1',api_key='notneeded',approval_mode='review')
        for _ in range(200):
            status=self.rt.status(job)
            if status['approval']:return job,status['approval']
            await asyncio.sleep(0.005)
        self.fail('A aprovação não foi solicitada.')

    async def test_approval_gate_and_wrong_id(self):
        job,request=await self.launch()
        self.assertEqual(self.sent,[],'No click before approval')
        self.assertEqual(self.rt.status(job)['status'],'approval')
        self.assertNotIn('text',request)
        with self.assertRaises(ValueError):self.rt.decide(job,'bad-id','approve')
        with self.assertRaises(ValueError):self.rt.decide(job,request['requestId'],'invalid')
        self.assertEqual(self.sent,[])
        self.rt.decide(job,request['requestId'],'approve')
        await self.rt.tasks[job]
        self.assertEqual(self.sent,['click'])
        self.assertTrue(self.rt.store.verify_chain(job))
        self.assertTrue(any(e['event']=='approval_decided' for e in self.rt.store.events(job)))

    async def test_rejection_prevents_click(self):
        job,request=await self.launch()
        self.rt.decide(job,request['requestId'],'reject')
        await self.rt.tasks[job]
        self.assertEqual(self.sent,[])
        self.assertEqual(self.rt.status(job)['status'],'needs_review')

    async def test_cancel_while_waiting(self):
        job,_=await self.launch()
        self.assertTrue(self.rt.cancel(job))
        await asyncio.gather(*list(self.rt.tasks.values()),return_exceptions=True)
        self.assertEqual(self.sent,[])
        self.assertIsNone(self.rt.status(job)['approval'])
        self.assertEqual(self.rt.status(job)['status'],'cancelled')

class BrowserStartRaces(unittest.IsolatedAsyncioTestCase):
    async def test_one_browser_for_two_workspaces(self):
        with tempfile.TemporaryDirectory() as root:
            count=0
            class Context:
                async def close(self):pass
            async def factory():
                nonlocal count
                count+=1
                await asyncio.sleep(0.02)
                return Context()
            rt=Runtime(Path(root)/'db',Path(root)/'profile',browser_factory=factory)
            await asyncio.gather(rt.ensure_browser(),rt.ensure_browser(),rt.ensure_browser())
            self.assertEqual(count,1)
            await rt.shutdown()
