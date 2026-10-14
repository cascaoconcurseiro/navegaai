# NavegaAI 1.1.2 LAB TabReady — correção do bloqueio ao iniciar

## Sintoma

A interface exibia `Não foi possível iniciar: Abra uma página web HTTP(S) na aba desta conversa.` ao enviar a primeira mensagem em conversas recém-criadas ou em abas `about:blank` / `chrome://newtab/`.

## Causa confirmada no código

A versão 1.1.1 efetuava uma comparação imediata de `tab.url` contra HTTP(S) antes de aguardar a navegação inicial:

```javascript
const tab=await chrome.tabs.get(tabId);
if(!/^https?:\/\//.test(tab.url||''))throw Error('Abra uma página web HTTP(S) na aba desta conversa.');
```

A criação de conversa abria uma URL web e respondia antes do carregamento terminar. O Chrome pode informar URL vazia, `about:blank` ou uma URL ainda pendente. O painel também permite uso em uma aba `chrome://newtab/`.

## Correções

- `src/tab-readiness.js`: nova camada de preparação do tabId associado à conversa.
- Se já há HTTP(S) pronto, usa o endereço sem navegar desnecessariamente.
- Se há `pendingUrl` web, espera o endereço ficar pronto sem substituir uma navegação em andamento.
- Se há uma Nova guia vazia, inicializa na **mesma aba** uma página web (`https://www.google.com/`) e aguarda que fique pronta.
- Se há uma página protegida (`chrome://settings`, `chrome://extensions`, `chrome-extension://`, `file://`), não a sobrescreve: explica que uma página HTTP(S) ou nova conversa é necessária.
- `src/background.js`: uma conversa nova agora nasce em `about:blank`, sem iniciar navegação prematura. A preparação acontece ao executar uma tarefa.
- `src/execution-engine.js`: integra a etapa de preparação. Falhas de pré-execução preservam o pedido e o motivo na conversa e geram evento `run_preflight_failed` na auditoria.
- Evento `conversation_tab_prepared` quando uma aba de trabalho vazia é inicializada.

## Validação

- Testes automatizados: 63/63 aprovados (incluindo a suíte já existente).
- Novos testes: URL web pronta, Nova guia vazia, pendingUrl, carregamento, mudança de origem, páginas protegidas, aba fechada, isolamento por tabId, falha rastreável e bloqueio de URL não-web.
- `npm run check`: sintaxe dos módulos verificada.
- Manifestos Standard e Advanced: versão 1.1.2; Standard sem permissão `debugger`, Advanced com essa permissão.

## O que NÃO foi validado

- Instalação no perfil Chrome real do usuário.
- Tarefas reais de Gmail ou OpenRouter.
- Conectividade de internet e carregamento do Google no ambiente do usuário.

## Como testar

1. Desative versões anteriores do NavegaAI em `chrome://extensions`.
2. Extraia **uma** edição do ZIP e carregue a pasta `NavegaAI-Extension` com `manifest.json`.
3. Clique em `+` para criar conversa nova.
4. Envie `Abra o Gmail` (se usar IA com ferramentas) ou inicie em modo Demonstração.
5. Confirme que a mesma aba de trabalho é inicializada e não há a mensagem antiga.
6. Teste com uma aba `https://example.org` e confirme que ela não muda antes da tarefa do agente.
7. Teste a página `chrome://extensions`: a extensão deve impedir operação e explicar que é uma página protegida.
8. Se falhar, abra **Ver atividade** e exporte o log JSONL para diagnóstico.

### Limite operacional

Uma extensão Chrome não pode injetar scripts em páginas protegidas do próprio Chrome. A correção não deve tentar burlar essa restrição. Se a página de trabalho não carregar, o usuário verá mensagem acionável.
