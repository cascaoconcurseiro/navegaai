"""Live Chromium integration: only controlled localhost fixture, never user's accounts."""
import asyncio
import shutil
import tempfile
import unittest
from pathlib import Path
from playwright.async_api import async_playwright
from runtime.core import Runtime

PAGE=b'''<!doctype html><html><body><label for="topic">Assunto</label><input id="topic" />
<button type="button" onclick="setTimeout(()=>{const s=document.createElement('p');s.textContent='Concluido!';document.body.append(s)},75)">Executar teste</button></body></html>'''

class BrowserIntegration(unittest.IsolatedAsyncioTestCase):
    async def test_end_to_end_playwright_proof(self):
        root=tempfile.TemporaryDirectory()
        browser=None
        try:
            class SyntheticPage:
                # DOM is executed by real Chromium; navigation is a test-only set_content
                # because this environment's administrator blocks all HTTP(S) navigation.
                def __init__(self,real):self.real=real;self.url='https://navegaai-lab.example/'
                async def goto(self,url,**kwargs):await self.real.set_content(PAGE.decode())
                def is_closed(self):return self.real.is_closed()
                def locator(self,*a,**k):return self.real.locator(*a,**k)
                def get_by_role(self,*a,**k):return self.real.get_by_role(*a,**k)
                def get_by_label(self,*a,**k):return self.real.get_by_label(*a,**k)
                def get_by_text(self,*a,**k):return self.real.get_by_text(*a,**k)
                async def evaluate(self,*a,**k):return await self.real.evaluate(*a,**k)
            class SyntheticContext:
                def __init__(self,context):self.context=context
                async def new_page(self):return SyntheticPage(await self.context.new_page())
                async def close(self):await self.context.close()
            async def browser_factory():
                nonlocal browser
                browser=await async_playwright().start()
                options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
                if shutil.which('chromium'):
                    options['executable_path']=shutil.which('chromium')
                context=await browser.chromium.launch_persistent_context(
                    str(Path(root.name)/'profile'),**options)
                return SyntheticContext(context)
            sequence=[('fill',{'name':'Assunto','text':'Relatorio'}),
                      ('click',{'role':'button','name':'Executar teste'}),
                      ('verify',{'contains_text':'Concluido!'}),None]
            calls=iter(sequence)
            async def model_client(model,messages,tools):
                next_action=next(calls)
                if next_action is None:return {'content':'Concluído com prova de mudança de estado.','tool_calls':[]}
                name,args=next_action
                # Read the unique proof handle returned by the click, not a guessed handle.
                if name=='verify':
                    import json as json_parser
                    last=[m for m in messages if m.get('role')=='tool' and m.get('name')=='click'][-1]
                    args={**args,'action_id':json_parser.loads(last['content'])['action_id']}
                import json
                return {'content':'','tool_calls':[{'id':'id'+name,'type':'function','function':{'name':name,'arguments':json.dumps(args)}}]}
            runtime=Runtime(Path(root.name)/'state.sqlite',Path(root.name)/'profile',headless=True,
                            browser_factory=browser_factory,model_client=model_client)
            url='https://navegaai-lab.example/'
            job=await runtime.submit(workspace='chat1',prompt='Teste',url=url,model='fake',
              base_url='https://openrouter.ai/api/v1',api_key='test-key',approval_mode='auto')
            await asyncio.wait_for(runtime.tasks[job],timeout=65)
            result=runtime.status(job)
            assert result['status']=='completed',result
            assert result['answer'].startswith('Concluído'),result
            assert any(e['event']=='tool_succeeded' and e.get('status')=='verified' for e in result['events'])
            page=runtime.pages['chat1']
            assert await page.locator('#topic').input_value()=='Relatorio'
            assert await page.get_by_text('Concluido!').count()==1
            # Strict target uniqueness is enforced before interaction.
            await page.evaluate('''() => {let b=document.createElement('button');b.textContent='Executar teste';document.body.append(b)}''')
            with self.assertRaises(ValueError):
                await runtime._action(page,'click',{'role':'button','name':'Executar teste'},'auto',{url.rstrip('/')},False,None)
            await runtime.shutdown()
        finally:
            if browser:
                try:await browser.stop()
                except Exception:pass
            root.cleanup()

if __name__=='__main__':unittest.main()
