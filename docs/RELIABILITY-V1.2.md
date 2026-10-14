# NavegaAI 1.2 Reliability LAB — Relatório técnico

**14/10/2026.** Esta é uma prévia de confiabilidade, **não** uma extensão comprovadamente superior a Claude, ChatGPT ou a um operador humano.

## Problemas combatidos

1. **Refs que expiram:** `agent.js` agora pode emitir `recovery_attempt`, reler a página e relocalizar o elemento pelo **nome acessível exato** e tipo compatível. Se houver zero ou dois candidatos, **não clica**. Nunca repete automaticamente um clique já despachado.
2. **Cliques em elementos encobertos:** `chrome-browser.js` avalia visibilidade, `aria-disabled`, `pointer-events`, viewport e o alvo em `elementFromPoint` quando disponível. Esses testes aproximam princípios públicos de *actionability*, mas não implementam o conjunto completo do Playwright (não há checagem robusta de estabilidade temporal, iframes complexos ou canvas).
3. **Formulários que ignoram preenchimento:** valida valor após despacho de eventos, antes de informar sucesso da ferramenta. Isso não certifica processamento remoto.
4. **Falsas provas:** `verify_page` distingue um texto novo de um texto que já existia **antes do clique**. Um indicador previamente presente não certifica nova operação. Evidências remotas, como efetiva entrega de e-mail, ainda exigem verificadores específicos.
5. **Loops e desperdício:** após quatro leituras idênticas sem mutações, o agente contabiliza erro de ausência de progresso; repetição de falhas aciona o circuito já existente. A observação pós-mudança é compacta (até 2.700 caracteres de texto e 70 controles; a leitura completa continua disponível).
6. **Auditoria contextual:** grava tentativas de recuperação e diagnósticos finais em eventos, com contadores `recoveryAttempts`, `recoveredTargets`, tipos de falha e tempos. Sem armazenar valores de campos preenchidos nos logs.
7. **Contexto incremental:** observações de ferramentas e capturas antigas são compactadas antes de novas consultas ao modelo. O histórico de chamadas continua válido, mas referências antigas deixam de ocupar o prompt. Não foi medido o ganho em API real.
8. **Cancelamento:** novas ações passam a verificar o sinal de cancelamento antes de chamar `chrome.scripting.executeScript` ou `tabs.update`. Uma chamada Chrome **já despachada** ainda pode terminar; não há garantia de reversão.

## Arquitetura incluída

`src/recovery.js` contém critérios de autorrecuperação e classificação de falhas. `src/agent.js` coordena as verificações, métricas, recuperação e limite de ciclos. `src/chrome-browser.js` impõe pré-condições na aba e observa os resultados. `src/execution-engine.js` vincula cada execução à aba, processa aprovações e registra o diagnóstico.

## Validação executada

- `npm test`: 72/72 testes automatizados, incluindo nove novos cenários de recuperação, ambiguidades, verificação de texto pré-existente, bloqueio de elemento encoberto e leitura sem progresso.
- `npm run check`: verificação sintática dos módulos.
- `python scripts/smoke_browser.py`: motor DOM verificado em Chromium headless real, numa página HTML local controlada.
- Teste de **instalação da extensão em Chrome com interface gráfica**: não concluído. A tentativa com Xvfb neste ambiente expirou. Não testar Gmail autenticado, pagamentos ou outras operações de produção sem supervisão.

## Limitações que permanecem

- Não há autoaprendizado autônomo que execute scripts aprendidos sem verificação, e a memória procedural continua aprovada pelo usuário.
- Não há Playwright integrado à sessão Chrome do usuário, WebDriver BiDi, agente multimodal completo nem runtime independente do browser. O CDP continua experimental somente na edição Advanced e requer autorização.
- A recuperação é **intencionalmente conservadora**; campos sem rótulos acessíveis únicos, iframes cross-origin e aplicativos canvas ainda falham com pedido de intervenção.
- Não há deduplicação comprovável de transações remotas em sites de terceiros. Um clique de envio, compra ou publicação não deve ser repetido sem evidência externa ou autorização específica.
- O cron opera sob as limitações do Chrome e o catálogo OpenRouter depende do provedor. Não foi medido ganho real de velocidade contra serviços de IA.
- Os 70 testes não medem taxa de sucesso em sites públicos em escala; não representam garantia de alto acerto.

## Próximo passo recomendado

Criar um benchmark de navegação com 30–100 tarefas controladas (formularios React, Gmail de teste, navegações, iframes e páginas dinâmicas), medindo sucesso comprovado, duração, gasto em API, intervenção humana e repetição indevida. Uma versão “estável” depende desse conjunto e de teste em Chrome desktop real.
