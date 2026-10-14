"""End-to-end tests on a LOCAL adversarial page using the actual pageOperation.
This validates browser-side DOM, NOT the installed extension or an authenticated site.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]
src=(root/'src/chrome-browser.js').read_text()
fn=src[src.index('export function pageOperation('):src.index('\nexport class ChromeBrowser')].replace('export function','function',1)
cases=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1000,'height':700})
    pg.set_content('''<html><body>
      <label for="subject">Assunto da mensagem</label><input id="subject">
      <span id="labelledby">Destino do relatório</span><input aria-labelledby="labelledby" id="dest">
      <button id="send">Enviar</button><button id="danger">Enviar e apagar tudo</button>
      <div id="form"></div><p id="old">Mensagem enviada</p>
      <script>document.getElementById('send').onclick=()=>setTimeout(()=>{
        const p=document.createElement('p');p.id='result';p.textContent='Confirmado novo envio';document.body.append(p)},110);
      </script>
      </body></html>''')
    pg.add_script_tag(content=fn)
    s=pg.evaluate('pageOperation("snapshot",{})')
    def ref(label):
        return next(row.split(' ')[0] for row in s['elements'] if f'nome="{label}"' in row)
    subject=ref('Assunto da mensagem');dest=ref('Destino do relatório');send=ref('Enviar');danger=ref('Enviar e apagar tudo')
    assert subject!=dest!=send!=danger
    cases.append('accessible labels and unique references')
    pg.evaluate('r=>pageOperation("fill",{ref:r,text:"Teste" ,expectedLabel:"Assunto da mensagem"})',subject)
    assert pg.locator('#subject').input_value()=='Teste'
    cases.append('native form field with HTML label')
    pg.evaluate('r=>pageOperation("fill",{ref:r,text:"Pasta" ,expectedLabel:"Destino do relatório"})',dest)
    assert pg.locator('#dest').input_value()=='Pasta'
    cases.append('aria-labelledby input filling')
    try:
        pg.evaluate('r=>pageOperation("click",{ref:r,expectedLabel:"Enviar"})',danger)
        raise AssertionError('wrong target accepted')
    except Exception as e:
        assert 'ALVO_MUDOU' in str(e)
    cases.append('late expected label validation rejects similar text')
    assert pg.evaluate('pageOperation("verify",{containsText:"Mensagem enviada"})')['evidence']=='already_present'
    cases.append('old confirmation not accepted as new proof')
    pg.evaluate('r=>pageOperation("click",{ref:r,expectedLabel:"Enviar"})',send)
    pg.locator('#result').wait_for()
    assert pg.evaluate('pageOperation("verify",{containsText:"Confirmado novo envio"})')['evidence']=='changed_state'
    cases.append('delayed outcome changes evidence state')
    pg.evaluate("""()=>{const old=document.getElementById('subject');
      const n=old.cloneNode();old.replaceWith(n)}""")
    try:
        pg.evaluate('r=>pageOperation("fill",{ref:r,text:"Nao"})',subject)
        raise AssertionError('stale target accepted')
    except Exception as e:
        assert 'Elemento não encontrado/visível' in str(e)
    cases.append('SPA rerender invalidates obsolete element')
    pg.evaluate("""()=>{let box=document.createElement('div');box.id='cover';box.style='position:fixed;inset:0;z-index:999999;background:#fff';document.body.append(box)}""")
    try:
        pg.evaluate('r=>pageOperation("click",{ref:r,expectedLabel:"Enviar"})',send)
        raise AssertionError('covered click accepted')
    except Exception as e:
        assert 'ALVO_ENCOBERTO' in str(e)
    cases.append('overlay blocks wrong hit target')
    b.close()
print(json.dumps({'scenario':'Adversarial local Chromium','result':'PASS','count':len(cases),'cases':cases},ensure_ascii=False,indent=2))
