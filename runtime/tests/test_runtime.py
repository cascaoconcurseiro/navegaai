import asyncio
import tempfile
import unittest
from pathlib import Path
from runtime.core import Runtime, Store, origin_of, valid_web_url, safe_event


class RuntimeCoreTests(unittest.IsolatedAsyncioTestCase):
    def test_store_interrupted_no_replay(self):
        with tempfile.TemporaryDirectory() as root:
            file=Path(root)/'db.sqlite'
            first=Store(file)
            first.create('id','chat','Enviar mensagem','model','https://example.com')
            first.set('id',status='running')
            first.append('id',{'event':'tool_dispatched','tool':'click','detail':'dados seguros'})
            second=Store(file)
            self.assertEqual(second.job('id')['status'],'interrupted')
            self.assertEqual([x['event'] for x in second.events('id')],['tool_dispatched'])
            first.close();second.close()

    def test_urls_and_sanitization(self):
        for bad in ('javascript:alert(1)','file:///etc/passwd','https://user:pw@example.com','http://fake.internal','https://'):
            with self.assertRaises(ValueError):valid_web_url(bad)
        self.assertEqual(origin_of('https://mail.google.com/mail/u/0/'),'https://mail.google.com')
        self.assertNotIn('password',str(safe_event({'event':'test','password':'s3cret'})))

    async def test_cancel_during_browser_start_is_recorded_without_unbound_state(self):
        with tempfile.TemporaryDirectory() as root:
            started=asyncio.Event()
            async def slow_browser():
                started.set()
                await asyncio.Event().wait()  # cancelled before a page exists
            rt=Runtime(Path(root)/'db',Path(root)/'profiles',browser_factory=slow_browser)
            try:
                job=await rt.submit(workspace='w',prompt='Abra um site',url='https://example.com',
                                    model='fixture',base_url='https://openrouter.ai/api/v1',
                                    api_key='unused',approval_mode='auto')
                await asyncio.wait_for(started.wait(),timeout=1)
                active=rt.tasks[job]
                active.cancel()
                result=await asyncio.gather(active,return_exceptions=True)
                self.assertIsInstance(result[0],asyncio.CancelledError)
                self.assertEqual(rt.status(job)['status'],'cancelled')
                self.assertIn('cancelled',[e['event'] for e in rt.store.events(job)])
            finally:
                await rt.shutdown()

    async def test_submit_idempotent_and_workspace_isolation(self):
        with tempfile.TemporaryDirectory() as root:
            gate=asyncio.Event()
            class Context:
                async def new_page(self):
                    await gate.wait()
                    return None
                async def close(self):pass
            async def factory():return Context()
            runtime=Runtime(Path(root)/'jobs.sqlite',Path(root)/'profile',browser_factory=factory)
            data=dict(workspace='c1',prompt='Leia página',url='https://example.com',model='fake',
                      base_url='https://openrouter.ai/api/v1',api_key='secret',approval_mode='read_only',
                      client_job_id='a'*32)
            a=await runtime.submit(**data)
            b=await runtime.submit(**data)
            self.assertEqual(a,b)
            self.assertEqual(len(runtime.tasks),1)
            with self.assertRaises(ValueError):
                await runtime.submit(**{**data,'prompt':'Outro pedido'})
            with self.assertRaises(ValueError):
                await runtime.submit(**{**data,'approval_mode':'skip'})
            with self.assertRaises(ValueError):
                await runtime.submit(**{**data,'allowed_origins':['https://other.example']})
            other=await runtime.submit(**{**data,'workspace':'c2','client_job_id':'b'*32})
            self.assertNotEqual(a,other)
            gate.set()
            await asyncio.gather(*list(runtime.tasks.values()),return_exceptions=True)
            self.assertEqual(runtime.store.job(a)['workspace'],'c1')
            self.assertEqual(runtime.store.job(other)['workspace'],'c2')
            await runtime.shutdown()

    async def test_security_validation(self):
        with tempfile.TemporaryDirectory() as root:
            runtime=Runtime(Path(root)/'jobs.sqlite',Path(root)/'profile')
            kw=dict(workspace='w',prompt='a',url='https://example.com',model='m',
                    base_url='https://openrouter.ai/api/v1',api_key='key')
            with self.assertRaises(ValueError):
                await runtime.submit(**kw,allowed_origins=['https://example.com/evil'])
            with self.assertRaises(ValueError):
                await runtime.submit(**kw,approval_mode='god_mode')
            await runtime.shutdown()

if __name__=='__main__':unittest.main()
