# NavegaAI — Engenharia técnica de automação de navegadores

**Revisão:** 14/10/2026. **Natureza:** análise de interfaces públicas, arquitetura proposta e diagnóstico da implementação NavegaAI 0.4.0. **Não** é engenharia reversa de código proprietário da OpenAI ou Anthropic. Não temos acesso à implementação interna desses serviços.

## 1. O que se sabe sobre o ChatGPT e sistemas similares

A documentação pública da OpenAI separa: (a) busca/leitura de páginas; (b) *computer use* por screenshots e ações estruturadas ou código em um ambiente fornecido pela aplicação; e (c) ChatGPT Work com navegador remoto e sessões próprias. O loop de *computer use* é **observar → decidir → executar → observar**. O controlador fornece ferramentas, executa eventos e devolve telas/estado; o modelo não ganha automaticamente acesso direto ao computador do usuário. O navegador da nuvem tem controles de domínio, confirmação de ações consequentes e opção de intervenção humana. Esses princípios são publicamente documentados, mas detalhes dos modelos, classificadores e runtimes proprietários não podem ser obtidos deste chat.

Fontes:
- https://developers.openai.com/api/docs/guides/tools-computer-use
- https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt
- https://openai.com/index/computer-using-agent/
- https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide

## 2. Matriz das tecnologias candidatas

| Componente | Força real | Limite real | Aplicação recomendada |
|---|---|---|---|
| Manifest V3 + sidePanel + chrome.scripting | Opera dentro do Chrome do usuário, preserva perfil/autenticação e pode fixar `tabId` | Service worker pode suspender; restrições a páginas/frames protegidos | Camada padrão |
| Chrome DevTools Protocol, por chrome.debugger | Input real, screenshots, DOMSnapshot, Accessibility, tracing, Network/Console | Aviso de permissão; conflito com DevTools; nem todo domínio é permitido; alterações e bloqueios de política | Fallback/depuração opcional |
| Playwright + Playwright MCP | Localizadores, espera automática, acesso à árvore de acessibilidade, testes/reprodução | Melhor com navegador/sessão gerenciada; não se injeta como biblioteca mágica dentro de MV3 | Ponte local opcional de nível profissional |
| Chrome DevTools MCP | Capturas, rede, console, traces e análise de performance | Normalmente servidor externo e ambiente altamente privilegiado | Diagnóstico de falhas |
| Stagehand 3 | `observe`, `act`, `extract`, cache e reparação de ações | Depende do ambiente e pode exigir modelo para novas páginas | Fluxos repetidos/semiestruturados |
| Browser Use | Agentes especializados, ferramentas Python/TS, histórico e execução gerenciada | Não garante operar na mesma aba de um Chrome já aberto sem integração específica | Motor alternativo sob consentimento |
| agent-browser | Comandos enxutos, refs `@eN`, automação orientada a agentes | CLI/daemon separado | Protótipo e motor local |
| BrowserOS neo MCP | Navegador especial para agentes e ferramentas MCP | Sessão separada; sem garantia de isolamento de uma única aba do Chrome | Integração explícita de segundo navegador |
| WebDriver BiDi | Protocolo bidirecional padronizado, eventos e futuro multiplataforma | Padrão ainda em evolução; não substitui API MV3 | Ponte futura para Firefox/outros |
| BrowserGym / WebArena / WorkArena | Bancos de tarefas e métricas para avaliar progresso | Benchmark não garante desempenho em todos os sites do usuário | Qualidade e regressão |

Fontes: https://github.com/microsoft/playwright-mcp ; https://github.com/ChromeDevTools/chrome-devtools-mcp ; https://github.com/browserbase/stagehand ; https://github.com/browser-use/browser-use ; https://github.com/vercel-labs/agent-browser ; https://github.com/ServiceNow/BrowserGym ; https://www.w3.org/TR/webdriver-bidi/ ; https://developer.chrome.com/docs/extensions/reference/api/debugger

**Decisão:** começar com `chrome.scripting` e comandos declarados, não com `Runtime.evaluate` livre do LLM. Ativar CDP com consentimento quando o DOM não bastar. Criar uma ponte local opcional só quando medirmos sua necessidade. MCP é uma forma de expor ferramentas, não é, sozinho, um motor de navegador.

## 3. Arquitetura de referência

```text
Chrome tab A  [BORDER BLUE]  (tabId imutável na execução)
      |     observação isolada         | eventos do executor
      v                               v
Content script/DOM/AX -- refs --> UI sidePanel + log de eventos
      ^                               |
      |                               v
Ações parametrizadas  <------  Orquestrador durável / plano de execução
      ^                               |
      |                   +-----------+------------+
      |                   |                        |
      |              Risk/Policy                 LLM Gateway
      |                   |                 OpenRouter/DeepSeek/Qwen
      |                   v                        |
      +------ Human approval <---- Decision/Tool proposal

Opcional:  Bridge local -- Playwright / Chrome DevTools / CDP
                               |
                       navegador/sessão isolada
```

**Invariante de segurança do navegador:** um `runId` está associado a um `tabId`, origem inicial, perfil de permissões e cancelador. Todas as ferramentas verificam o tabId. Ferramentas de criar/trocar/fechar tabs são negadas nesse modo. Navegação no *mesmo tabId* é possível com confirmação. Por padrão, uma execução global por vez, para evitar disputa de controle. Um job cron de leitura só lê a origem autorizada.

**Modelo de estados:** `IDLE → PLANNING → OBSERVING → WAITING_APPROVAL → EXECUTING → VERIFYING → (PLANNING | COMPLETED | FAILED | CANCELLED)`; cada transição produz evento no audit log. Planos devem declarar pré-condições e condição de sucesso mensurável, não apenas texto "feito".

## 4. Percepção — estratégia em quatro níveis

1. **DOM semântico**: extrair título, URL, texto visível truncado, inputs editáveis, botões, links e labels, sem ler valores secretos. Resolver labels por `aria-label`, `aria-labelledby`, `<label for>`, `role`, `placeholder`, `name`.
2. **Árvore de acessibilidade** (AX): quando o DOM é grande, complexo ou pouco expressivo, usar `Accessibility`/Playwright. Refs da observação devem carregar `frameId`, `documentId`, geração, role e nome.
3. **Imagem e geometria**: screenshot pontual, regiões e coordenadas normalizadas; útil para canvas, gráficos, editor visual, botões sem semântica e layouts de ícones. Não enviar screenshots continuamente: custo, latência e privacidade.
4. **Eventos do navegador**: Console, Log, Network, erros JS e navegação explicam por que a página não reagiu. Preferir metadados; cargas HTTP e cookies podem conter segredos.

**Snapshots diferenciais:** obter observação completa no início e enviar somente árvore/relevância alterada nas etapas seguintes. Incluir `generation`, documento e *fingerprint* de alvo, nunca manter ref entre navegações. Um `MutationObserver` pode invalidar refs, mas tem de ignorar mutações causadas pelo próprio overlay.

## 5. Ação e confiabilidade

**Escada de execução, da mais estável à mais custosa:**

A. Ferramenta determinística com referência atual (`click_ref`, `fill_ref`, `select_ref`, `scroll`).

B. Locator acessível/Playwright com *auto-wait* (ex.: papel `button`, nome "Salvar") e unicidade confirmada.

C. Input CDP `Input.dispatchMouseEvent`/`dispatchKeyEvent` e snapshot/screenshot posterior; mover o cursor gráfico de forma sincronizada com o evento.

D. Visão com clique por coordenada, somente quando não existir alvo estrutural e a captura estiver atual; reconfirmar escala, scroll e iframe.

E. Pedir takeover ao usuário quando houver CAPTCHA, pagamento, login forte, OTP, bloqueio explícito ou ambiente desconhecido.

`HTMLElement.click()` pode disparar handlers web, mas o evento não tem as mesmas garantias de entrada produzida pelo navegador. Para React/Vue/SPA, usar setter nativo do campo + `input`/`change` ajuda em alguns componentes; quando um site exige interação confiável, usar mecanismos de input do navegador. Não falsificar status "sucesso" apenas porque o método retornou `ok`.

**Execução em duas fases:**

```text
OBSERVE(current) -> PROPOSE(action, ref, fingerprint, preconditions)
   -> POLICY(classification) -> APPROVE(if needed)
   -> REVALIDATE(tabId, documentId, target, fingerprint, site)
   -> EXECUTE(action)
   -> OBSERVE(after)
   -> CHECK(postconditions)
   -> COMMIT(outcome, evidence, audit)
```

Se houver mudança de URL, frame, valor-alvo ou identidade do elemento depois da aprovação, descartar a autorização e solicitar nova observação. Após uma mutação, não executar outras mutações do mesmo pacote de *tool calls* baseadas no snapshot anterior.

## 6. Catálogo de falhas e correções

| Sintoma | Diagnóstico objetivo | Reação correta |
|---|---|---|
| SPA/React atualiza sem reload | URL virtual, DOM mutation, componentes montando | Aguardar condição visível específica e renovar referências |
| Lazy loading ou lista virtual | Elemento não aparece/scroll position | Rolar progressivamente com limite, inspeção incremental |
| Shadow DOM aberto | Elementos não aparecem em querySelector na raiz | Descer em `shadowRoot`, criar localizador composto |
| Shadow DOM fechado | Elementos ocultos à automação DOM usual | AX/screenshot/interação visual quando permitido |
| iframe same-origin/cross-origin | Ref da página principal não alcança frame | `scripting.allFrames`/frame IDs com permissões; CDP child target quando autorizado |
| Botão coberto por overlay | Hit-test indica outro elemento | `elementFromPoint`, rolar, aguardar desaparecer; pedir revisão se persistir |
| `isTrusted=false` / app ignora click JS | Eventos sintéticos recusados | Fallback opcional para CDP/Playwright, não forjar flags JS |
| Falha de CORS | Request de extensão ou ponte bloqueado | Endpoint compatível, permissões legítimas, ponte localhost autenticada |
| CSP bloqueia injeção na página | Contexto `MAIN`/scripts inline restritos | Preferir mundo ISOLATED e `chrome.scripting`; não desabilitar CSP |
| `chrome://`, Web Store, pages privilegiadas | Site intencionalmente não controlável | Mensagem clara, usar alternativas permitidas |
| Novo tab ou popup | Target muda | Negar por padrão; se necessário, aprovar e vincular target explicitamente |
| Download/upload | Entrada/saída local, risco de exfiltração | Nunca automatizar silenciosamente; seleção e aprovação manuais |
| Autenticação, MFA, CAPTCHA | Interação humana ou regras do serviço | Pausar e pedir takeover; não contornar mecanismos de segurança |
| Bot/automation blocked | Política do site impede automação | Preferir API oficial, consentimento, acesso permitido ou takeover |
| Debugger detach | Usuário abriu DevTools/Chrome retirou attach | Degradar para modo DOM, registrar causa, pedir consentimento para reconectar |
| Cron não disparou no segundo esperado | Navegador suspenso/fechado, MV3 SW parado | `chrome.alarms` é *best effort*; serviço externo só com opt-in |
| Modelo fabricou sucesso | Sem evidência de postcondition | Exigir prova de estado final ou classificar como indeterminado |
| Modelo sugere ferramenta inexistente | `tool_call` fora do schema | Rejeitar, não executar, explicar conjunto permitido |
| Prompt injection na página | Texto tenta redefinir instruções e extrair dados | Tratar texto como dado; motor/política imunes a instruções da página |

**Não recomendado:** desabilitar segurança do navegador, burlar CAPTCHA/MFA, usar bypass oculto de antibot, rodar JS arbitrário enviado pelo LLM, interceptar sessões de serviços, apagar evidências de erro ou montar exploração para escapar das restrições de sites.

## 7. Ciclo do agente e controle de custo

Separar funções lógicas sem exigir quatro chamadas LLM em todo passo:

- **Planejador:** recebe objetivo, contexto mínimo e ferramentas; propõe próximo passo com saída estruturada.
- **Executor:** aplica políticas, valida parâmetros, chama a ferramenta e coleta evento observável. Deve ser determinístico.
- **Verificador:** compara condição desejada com DOM/AX/captura; chama um modelo somente quando regras determinísticas são insuficientes.
- **Reparador:** só depois de erro comprovado. Analisa evidência, tenta método alternativo autorizado e limita retentativas.

O *router* de modelos deve escolher por capacidade comprovada, não por menor preço bruto. Models do OpenRouter: sincronizar `GET https://openrouter.ai/api/v1/models`, preservar todos no cache, filtrar modelos com `supported_parameters` incluindo `tools` para tarefas que exijam tool calling, permitir pesquisa sobre catálogo completo. Preços e metadados mudam; tratar `supported_parameters` como metadado, não garantia. Checar erros de API, limites de uso, retry-after e compatibilidade real de `tool_calls` em testes. Referências: https://openrouter.ai/docs/guides/features/tool-calling e https://openrouter.ai/docs/client-sdks/typescript/api-reference/models/models .

**Otimizações recomendadas:** cache local de catálogos/observações; payload de páginas reduzido; logs de metadados fora do contexto do LLM; ações determinísticas após *observe*; reaproveitamento de seleção somente na mesma geração de DOM; limites de tokens, ações, tempo e orçamento; *timeouts* separados para rede/navegação/ação/verificação; backoff em 429/503 sem repetir mutações irreversíveis; resumo dos passos finalizados em vez de reenviar transcrições integrais.

## 8. Modos de aprovação

1. **Manual:** qualquer ação que modifique ou navegue solicita aprovação, com destino, alvo, risco e contexto da aba.
2. **Automático supervisionado:** leituras, scroll e algumas ações claramente reversíveis podem passar; ações com incerteza, envio, navegação externa ou consequências exigem confirmação.
3. **Somente leitura:** nenhuma mutação disponível. Ideal para trabalhos agendados e pesquisa.

Recomendação: **não ativar “pular todas as aprovações” como padrão**. Uma aprovação não concede autorização genérica para movimentar-se em outras abas, ler outros sites ou realizar tarefas distintas. Registrar `policyVersion`, decisão, motivo, aprovação, tabId e `runId`, sem credenciais.

Comparação documental: https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide .

## 9. Memória persistente

- **Episódica:** sequência de ações, resultados e falhas resumidas com origem temporal.
- **Procedural:** receitas que já funcionaram (ex.: para `site.com`, filtro da página está em menu X).
- **Semântica:** preferências do usuário e descrições de campos, vinculadas à origem/site e aprovadas por ele.
- **Recuperação:** primeiro filtro por site, finalidade, versão de UI e validade; buscar por texto/FTS5 antes de acrescentar vetores. Vetores locais (sqlite-vec) só se houver volume que justifique.
- **Governança:** não guardar passwords, OTPs, tokens, dados bancários, cookies ou screenshots sensíveis automaticamente. Permitir ver, corrigir, expirar e apagar cada memória.

**Aprendizado** não significa re-treinar pesos do modelo depois de cada ação: significa melhoria da política/rotinas ao capturar trajetórias avaliadas, memórias validadas e testes de regressão.

## 10. Cron / agendamento correto

No Chrome MV3, `chrome.alarms` é best-effort: pode atrasar, não roda após o navegador fechar e não mantém o service worker permanentemente vivo. O cron na extensão deve validar a aba e origem a cada disparo e trabalhar **apenas em leitura** sem pessoa presente. Para disponibilidade quando o computador estiver desligado, seria necessário agendador em servidor independente e navegador/sessão remota, com autenticação e consentimento distintos. Fonte: https://developer.chrome.com/docs/extensions/reference/api/alarms e https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle .

## 11. Logs, rastreabilidade, replay e privacidade

Eventos obrigatórios: `run_started`, `observation`, `tool_proposed`, `policy_decision`, `approval_requested`, `approval_granted/denied`, `tool_started`, `tool_finished`, `verification`, `retry`, `model_usage`, `task_outcome`, `run_finished`.

Campos: `eventId`, `runId`, `parentEventId`, `at`, `tabId`, `origin`, `modelId`, `step`, `tool`, `durationMs`, `risk`, `resultStatus`, `usage`, `errorCode`, `prevHash`, `hash`. *Nunca* colocar chave de API, OTP, cookies, valores de campos sensíveis ou corpo completo da página como padrão. Ativar captura de telas e rede apenas mediante escolha explícita, com retenção configurável.

A cadeia SHA-256 atual da v0.4 detecta alterações inadvertidas em registros da sequência exportada; **não** é assinatura externa nem prova contra adversário que consiga reescrever todos os registros locais. Para compliance sério: armazenamento append-only, segmentos ancorados externamente e chave HMAC/assinatura protegida fora do perfil do navegador, com política de retenção.

Para replay: salve plano de ações + estado resumido + hashes de screenshot opcional. *Replay determinístico de ações* não garante repetibilidade se o site mudou; documentar versão da página, viewport e dados de entrada.

## 12. Avaliação de acerto

Construir um conjunto próprio de 100 tarefas com resultados verificáveis, sites e versões diversas:
- leitura, pesquisa e formulário controlado;
- SPA React/Vue com atualizações assíncronas;
- iframes autorizados e shadow DOM;
- diálogos, estados carregando, mensagens de erro;
- múltiplos elementos com o mesmo nome;
- alteração de layout, zoom e rolagem;
- separação rigorosa de duas abas;
- páginas maliciosas com injeção de instruções;
- falhas de rede, modelo sem tool calls, reconexão;
- cenários de alto risco que **devem ser bloqueados**.

Métricas: `task_success_rate` com verificador independente, `unsafe_action_rate`, `false_success_rate`, `human_interventions_per_task`, `median/p95 latency`, `token_cost_per_success`, `recovery_rate`, `tab_isolation_violations`, `audit_completeness`. Relatar intervalo de confiança e dificuldade do corpus. Não afirmar superioridade sobre Claude sem ensaio comparável e repetido.

Teste automatizado inicial não substitui: testes com Chrome real, sessão MCP real, navegadores suportados, rede instável e usuários.

## 13. Roadmap de engenharia (prioridades)

**P0 — robustez e política:** ref com `documentId`/geração e revalidação de fingerprint imediatamente antes de clique; tab lease transacional; evidência real de pós-condição; não declarar sucesso com base apenas em `ok`; suíte E2E Chromium e testes de prompt injection; recuperação de travamentos.

**P1 — percepção:** AX tree, screenshots selecionados, visão fallback, iframe por frameId, observação diferencial, melhor resolução de labels, console/network diagnóstico.

**P2 — automação de maior precisão:** ponte opcional com Playwright, auto-wait, traces, CDP Input com hit-testing, detecção de popup e diálogo, modo takeover.

**P3 — produtividade:** templates de workflows confiáveis, caching, roteador de múltiplos modelos, ações observadas reutilizáveis, memória procedural validada e painel de métricas.

**P4 — maturidade:** agendador persistente externo opt-in, criptografia protegida pelo SO, auditoria ancorada e replay, sandbox para páginas não confiáveis, instrumentação real por WebDriver BiDi quando apropriado.

## 14. Estado real da versão entregue

**Implementado na v0.4:** chat lateral, catálogo dinâmico OpenRouter, provedores compatíveis, modo demo, ferramentas DOM na aba fixada, overlay de borda azul e cursor *visual*, cliques CDP experimentais opcionais, modos manual/auto supervisionado/leitura, rejeição de campos sensíveis comuns, cron de leitura com `chrome.alarms`, memória manual por origem, auditoria SHA-256 encadeada, exportação JSONL, observação após mutações e impedimento de múltiplas mutações por mesma rodada. Cliente MCP neo presente no código, mas o painel bloqueia sua execução no modo de isolamento estrito por não conseguir garantir que controla somente a aba alvo.

**Não implementado ou ainda não comprovado:** acesso de produção a AX por CDP, modelo multimodal para screenshots, WebDriver BiDi, Stagehand e Playwright integrados à sessão do Chrome, autorreparação validada, revalidação atômica entre aprovação/ação, local host nativo, cron quando PC está desligado, memória vetorial, criptografia do SO, replay audiovisual completo e comparativo de sucesso com Claude. `npm test` usa mocks, não prova comportamento em Chrome real; a ligação ao BrowserOS neo real não foi validada.

## 15. Lista de recursos oficiais

- Chromium Chrome Extension MV3: https://developer.chrome.com/docs/extensions/
- Chrome debugger/CDP: https://developer.chrome.com/docs/extensions/reference/api/debugger
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Playwright MCP: https://github.com/microsoft/playwright-mcp
- Playwright: https://playwright.dev/
- Chrome DevTools MCP: https://github.com/ChromeDevTools/chrome-devtools-mcp
- Stagehand: https://github.com/browserbase/stagehand
- Browser Use: https://github.com/browser-use/browser-use
- agent-browser: https://github.com/vercel-labs/agent-browser
- BrowserOS: https://github.com/browseros-ai/BrowserOS
- BrowserGym: https://github.com/ServiceNow/BrowserGym
- WebDriver BiDi: https://www.w3.org/TR/webdriver-bidi/
- OpenAI computer use: https://developers.openai.com/api/docs/guides/tools-computer-use
- Claude Chrome permissions: https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide
- OpenRouter tool calling: https://openrouter.ai/docs/guides/features/tool-calling
