# NavegaAI 0.5.0 — Alterações verificáveis

**Escopo:** experiência do usuário inspirada em conceitos do Claude in Chrome, sem reutilizar layout/código proprietário; gestão de modelos, autorização inicial por site, modo de aprovação rápido e consentimento CDP por tarefa.

## O que foi alterado

- `src/panel.html`, `src/panel.css`, `src/panel.js`: redesign de chat lateral, estados de execução, modo escuro/claro, seletor pesquisável OpenRouter em destaque, modos de permissão imediatos, confirmação de ação, tela de permissões por domínio, transparência sobre CDP.
- `src/site-permissions.js`: validação de origens, tipos de acesso `ask/allow/block` e concessão lógica CDP por `runId+tabId`.
- `src/background.js`: persistência da lista de sites, trilha de mudança de permissão, sessão de execução com origem e flag CDP, encerramento lógico na troca de origem e requisição de permissão permanente para cron.
- `src/chrome-browser.js`: rejeição de comandos em nova origem, confirmação de existência da concessão CDP antes de cliques CDP, nova leitura da referência antes do evento de mouse e retorno explícito de falhas do overlay ao iniciar.
- `src/demo.js`: correção de bypass das regras de somente leitura e aprovação de navegação.
- `tests/site-permissions.test.js`, `tests/agent.test.js`: testes de regras novas.

## O que NÃO foi implementado

- Arquitetura interna do Claude/ChatGPT não foi obtida nem reproduzida.
- Não há controle de navegador por visão multimodal, motor Playwright operando na aba Chrome do usuário, serviço local de longa duração ou testes reais CDP no ambiente do usuário.
- O aviso de alto risco do Chrome associado à permissão `debugger` não pode ser convertido em solicitação dinâmica. A edição Standard evita declará-la, e a edição Advanced a declara e exige consentimento adicional dentro do NavegaAI.
- `chrome.debugger` não expõe todas as capacidades do CDP; o sistema Advanced utiliza cliques `Input.dispatchMouseEvent` limitados.

## Segurança residual

A extensão possui acesso amplo a origens HTTP(S) e, na Advanced, ao debugger declarado em tempo de instalação. O isolamento por aba/origem é uma política implementada em código, não um sandbox obrigatório do Chrome. Um bug nesta política pode permitir ações além do pretendido. Não afirme isolamento absoluto.

Aprovações, resumos e histórico não impedem todos os ataques de prompt injection. Sites podem desencadear efeitos colaterais e abrir novas abas por seus próprios scripts. Esta versão deve ser tratada como beta supervisionado.

## Validações

- 22 testes automatizados passaram.
- Teste visual do painel com mocks de APIs Chrome passou em Chromium, em temas escuro e claro, incluindo bloqueio de CDP sem ciência explícita do usuário e autorização por site.
- Chromium com a extensão carregada em headless não expôs o service worker; uma tentativa com janela gráfica não concluiu a inicialização no ambiente. **Teste E2E de extensão real e CDP real ainda pendentes.**
