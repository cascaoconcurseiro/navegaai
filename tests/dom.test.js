import test from 'node:test';
import assert from 'node:assert/strict';
import {pageOperation} from '../src/chrome-browser.js';

test('leitura, refs, preenchimento, clique e bloqueio de senha no DOM',()=>{
  const old={document:globalThis.document,getComputedStyle:globalThis.getComputedStyle,
    HTMLInputElement:globalThis.HTMLInputElement,HTMLTextAreaElement:globalThis.HTMLTextAreaElement,
    HTMLSelectElement:globalThis.HTMLSelectElement,InputEvent:globalThis.InputEvent,location:globalThis.location};
  class Input {
    constructor(name,type='text') {this._value='';this.name=name;this.id=name;this.type=type;this.tagName='INPUT';this.isConnected=true;this.placeholder='';}
    get value(){return this._value;}
    set value(v){this._value=v;}
    getAttribute(){return null;}
    getBoundingClientRect(){return {width:120,height:25};}
    scrollIntoView(){}
    focus(){}
    dispatchEvent(){}
    closest(){return null;}
    click(){this.clicks=(this.clicks||0)+1;}
  }
  class Button extends Input {constructor(){super('Enviar');this.tagName='BUTTON';this.innerText='Confirmar';}}
  globalThis.HTMLInputElement=Input;
  globalThis.HTMLTextAreaElement=class {};
  globalThis.HTMLSelectElement=class {};
  globalThis.InputEvent=class extends Event {};
  globalThis.location={href:'http://127.0.0.1:8765/site-teste.html'};
  globalThis.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
  const field=new Input('nome'),pass=new Input('senha','password'),button=new Button();
  globalThis.document={title:'Demo',body:{innerText:'Página de demonstração. Teste local.'},querySelectorAll:()=>[field,pass,button]};
  try{
    const snap=pageOperation('snapshot',{});
    assert.equal(snap.elements.length,3);
    assert.ok(snap.elements[1].includes('[campo protegido]'));
    assert.equal(pageOperation('fill',{ref:'e1',text:'Maria'}).ok,true);
    assert.equal(field.value,'Maria');
    assert.throws(()=>pageOperation('fill',{ref:'e2',text:'secret'}),/bloqueado/);
    assert.equal(pageOperation('click',{ref:'e3'}).ok,true);
    assert.equal(button.clicks,1);
    globalThis.location.href='https://example.com/';
    assert.throws(()=>pageOperation('click',{ref:'e3'}),/expiraram/);
  }finally{
    for(const [key,value] of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
    delete globalThis.__navegaAiRefStateV1;
  }
});
