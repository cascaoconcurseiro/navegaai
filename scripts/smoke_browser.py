"""Tests native DOM actions in a real Chromium page, WITHOUT installing the extension.
Usage: python scripts/smoke_browser.py
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1]
source = (root / 'src/chrome-browser.js').read_text()
start = source.index('export function pageOperation(') + len('export ')
end = source.index('\nexport class ChromeBrowser')
function_source = source[start:end]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page()
    page.set_content('''<!doctype html><html><body>
      <label>Assunto <input id="subject" aria-label="Assunto"/></label>
      <div role="textbox" contenteditable="true" aria-label="Corpo da mensagem"></div>
      <button id="send">Enviar</button>
      <script>
        document.querySelector('#send').addEventListener('click',()=>{
          setTimeout(()=>{const msg=document.createElement('p'); msg.id='sent';msg.innerText='Mensagem enviada';document.body.append(msg);},80);
        });
      </script></body></html>''')
    page.add_script_tag(content=function_source)
    snap=page.evaluate('pageOperation("snapshot", {})')
    def lookup(label):
        for row in snap['elements']:
            if 'nome="' + label + '"' in row:
                return row.split(' ')[0]
        raise AssertionError(f'No element named {label}')
    subject,body,send=lookup('Assunto'),lookup('Corpo da mensagem'),lookup('Enviar')
    target=page.evaluate('(ref)=>pageOperation("preview",{ref})',send)
    assert target['visible'] and target['label']=='Enviar'
    page.evaluate('(ref)=>pageOperation("fill",{ref,text:"Teste NavegaAI"})',subject)
    page.evaluate('(ref)=>pageOperation("fill",{ref,text:"Corpo da mensagem de teste"})',body)
    assert page.locator('#subject').input_value()=='Teste NavegaAI'
    assert page.locator('[contenteditable]').inner_text()=='Corpo da mensagem de teste'
    page.evaluate('(ref)=>pageOperation("click",{ref})',send)
    page.wait_for_selector('#sent')
    assert page.evaluate('pageOperation("verify",{containsText:"Mensagem enviada"})')['verified']
    page.evaluate("document.querySelector('#send').remove()")
    try:
        page.evaluate('(ref)=>pageOperation("click",{ref})',send)
        raise AssertionError('Stale ref unexpectedly succeeded')
    except Exception as e:
        if isinstance(e, AssertionError):raise
        assert 'Elemento não encontrado/visível' in str(e)
    browser.close()
print(json.dumps({'browser':'Chromium headless','result':'PASS','cases':['snapshot','preview','native input','contenteditable','click','verify after async change','stale ref rejection']},ensure_ascii=False))
