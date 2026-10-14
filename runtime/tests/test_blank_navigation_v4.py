"""Regression: a blank Chrome conversation does not require a Google homepage."""
import asyncio
import tempfile
import unittest
from pathlib import Path
from runtime.core import Runtime


class Page:
    url='about:blank'


class BlankNavigation(unittest.IsolatedAsyncioTestCase):
    async def test_blank_origin_is_authorized_before_navigation(self):
        with tempfile.TemporaryDirectory() as directory:
            rt=Runtime(Path(directory)/'db.sqlite',Path(directory)/'profile')
            page=Page()
            calls=[]

            async def browser(workspace,url):
                self.assertEqual(url,'about:blank')
                return page

            async def observe(p):
                return {'url':p.url,'snapshot':'Aba vazia' if p.url=='about:blank' else 'Página pronta'}

            async def action(p,name,args,mode,allowed,sensitive,baseline):
                calls.append((name,mode,set(allowed)))
                p.url=args['url']
                return {'ok':True,'effect':'observed_change'},True

            steps=0
            async def model(model,messages,tools):
                nonlocal steps
                steps+=1
                if steps==1:
                    return {'content':'','tool_calls':[{'id':'n1','type':'function',
                        'function':{'name':'navigate','arguments':'{"url":"https://example.com/"}'}}]}
                return {'content':'Página aberta','tool_calls':[]}

            rt._page=browser
            rt._observe=observe
            rt._action=action
            rt.model_client=model
            try:
                job=await rt.submit(workspace='one',prompt='Abra https://example.com/',
                    url='about:blank',model='test',base_url='https://openrouter.ai/api/v1',
                    api_key='fixture',approval_mode='review')
                for _ in range(100):
                    status=rt.status(job)
                    if status['approval']:break
                    await asyncio.sleep(.005)
                else:self.fail('Expected new-origin consent')
                self.assertEqual(status['approval']['category'],'new_origin')
                self.assertEqual(calls,[])
                rt.decide(job,status['approval']['requestId'],'approve')
                await asyncio.wait_for(rt.tasks[job],timeout=5)
                self.assertEqual(len(calls),1)
                self.assertEqual(calls[0][1],'approved_once')
                self.assertIn('https://example.com',calls[0][2])
                self.assertTrue(any(e['event']=='origin_authorized' for e in rt.store.events(job)))
                self.assertTrue(rt.store.verify_chain(job))
            finally:
                await rt.shutdown()


if __name__=='__main__':
    unittest.main()


class RedirectApproval(unittest.IsolatedAsyncioTestCase):
    async def test_login_redirect_requests_consent_without_replaying(self):
        with tempfile.TemporaryDirectory() as directory:
            rt=Runtime(Path(directory)/'db.sqlite',Path(directory)/'profile')
            page=Page()
            page.url='https://mail.example/'
            calls=[]
            async def browser(workspace,url):return page
            async def observe(p):return {'url':p.url,'snapshot':'Login necessário'}
            async def action(p,name,args,mode,allowed,sensitive,baseline):
                calls.append(name)
                rt.blocked_navigations['work']='https://accounts.example'
                raise RuntimeError('ERR_BLOCKED_BY_CLIENT')
            n=0
            async def model(model,messages,tools):
                nonlocal n
                n+=1
                if n==1:
                    return {'content':'','tool_calls':[{'id':'n1','type':'function',
                        'function':{'name':'navigate','arguments':'{"url":"https://mail.example/"}'}}]}
                return {'content':'Rever estado da página','tool_calls':[]}
            rt._page=browser
            rt._observe=observe
            rt._action=action
            rt.model_client=model
            try:
                job=await rt.submit(workspace='work',prompt='Abra a caixa de entrada',
                    url='https://mail.example/',model='test',
                    base_url='https://openrouter.ai/api/v1',api_key='fixture',approval_mode='auto')
                for _ in range(100):
                    status=rt.status(job)
                    if status['approval']:break
                    await asyncio.sleep(.005)
                else:self.fail('Missing redirect authorization')
                self.assertEqual(status['approval']['category'],'redirect_origin')
                self.assertIn('https://accounts.example',status['approval']['label'])
                self.assertEqual(calls,['navigate'])
                rt.decide(job,status['approval']['requestId'],'approve')
                await asyncio.wait_for(rt.tasks[job],timeout=5)
                self.assertEqual(calls,['navigate'])  # No blind retries after uncertain transitions
                self.assertTrue(any(e['event']=='redirect_origin_authorized'
                    for e in rt.store.events(job)))
            finally:await rt.shutdown()
