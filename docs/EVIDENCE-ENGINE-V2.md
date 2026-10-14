# NavegaAI 2.0 Evidence LAB — relatório de engenharia e aceitação
Data: 14 de outubro de 2026. Base: NavegaAI v1.3 Integrity LAB.

## Motivação
O histórico real fornecido pelo usuário mostrou múltiplos cliques errados, tentativas sem efeito comprovado, chamadas de modelo lentas e estado de tarefa indeterminado. A estratégia foi priorizar os mecanismos que impedem **conclusões falsas**, não apenas acrescentar funcionalidades.

## Modificações verificadas

| Mudança | Arquivos | Falha evitada |
|---|---|---|
| Comparação estrita de rótulos | `src/chrome-browser.js` | `Enviar` não corresponde a `Enviar e apagar tudo` |
| Revalidação no momento do clique | `src/chrome-browser.js` | Alvo não pode mudar de nome após pré-inspeção sem bloqueio |
| Reconhecimento de `label`, `aria-labelledby` | `src/chrome-browser.js` | Campos sem aria-label passam a ter nome acessível |
| Contabilidade por token único | `src/chrome-browser.js`, `src/proof-engine.js`, `src/agent.js` | Prova de ação A não certifica ação B |
| Prova de preenchimento local | `src/proof-engine.js`, `src/agent.js` | Valor escrito pode ser confirmado localmente sem alegar envio |
| Retomada contextual sem replay cego | `src/continuation.js`, `src/execution-engine.js` | “continue” reaproveita o objetivo e falhas, com nova observação antes de agir |
| Guardas de pedidos em pergunta | `src/intent.js`, `src/agent.js` | “Você pode abrir o Gmail?” não pode terminar sem executar ferramentas |
| Limite para chamadas silenciosamente travadas | `src/deadlines.js`, `src/agent.js` | Falha sem resposta leva a resultado indeterminado, sem retry presumidamente seguro |
| Testes de comportamento adversarial | `tests/v20-*.test.js`, `scripts/stress_browser.py` | Regressões de UI reativa, overlay e sinal antigo |

**Observação:** `actionToken` é uma correlação interna de comandos gerada no executor. Não é assinatura do servidor nem prova criptográfica de um envio; o modelo pode perceber alteração DOM sem garantia de processamento externo. A operação ainda exige pós-condição relevante.

## Testes realizados e alcance

- `npm run check`: valida a sintaxe dos módulos, incluindo `deadlines.js`.
- `npm test`: 97 testes de lógica/simulação aprovados.
- `scripts/smoke_browser.py`: teste do mecanismo DOM em Chromium headless.
- `scripts/stress_browser.py`: 8 cenários adversariais em uma página controlada no Chromium headless, todos aprovados. Casos: rótulos HTML, aria-labelledby, alvo parecido, confirmação antiga, mudança assíncrona, rerender de SPA e sobreposição de alvo.
- Tentativa de Chromium headless com a extensão completa: nenhum service worker da extensão identificado, portanto **teste end-to-end de instalação não validado**. Não apresentado como sucesso.

Os dados acima NÃO são um benchmark do Claude, ChatGPT ou de sistemas web públicos. O percentual de sucesso real em Gmail, bancos, e-commerce e intranets ainda é desconhecido.

## Política de aprovação e segurança

Standard: sem `debugger`. Advanced: com `debugger`, consentimento por execução e isolamento de `tabId`. Uma opção interna não revoga permissão de Manifest V3. O motor sempre bloqueia campos classificados como sensíveis e tenta impedir criação de outra aba por ferramentas de execução. Sites protegidos, CAPTCHA, MFA e políticas de segurança não devem ser contornados.

## Tecnologias de referência (sem alegar implementação completa)

- Playwright: auto-waiting, testes de estabilidade de alvo e locators semânticos: https://playwright.dev/docs/actionability
- Playwright locator ARIA snapshot: https://playwright.dev/docs/api/class-locator
- OpenRouter streaming/tool-calling: https://openrouter.ai/docs/guides/features/tool-calling
- Restrição de `chrome.debugger` em Chrome 155 em ambientes empresariais: https://developer.chrome.com/blog/debugger-enterprise-policy-restrictions

## Riscos e próximos marcos, ainda pendentes

1. Testes com extensão carregada em Chrome de desktop, integração OpenRouter real e contas de teste autorizadas.
2. Recuperação multimodal avançada, com verificadores externos específicos para Gmail e downloads.
3. Executor local persistente, watchdog independente de MV3 e filas transacionais, sem prometer execução com PC desligado.
4. Benchmark independente em dezenas/centenas de tarefas, medindo conclusão real, intervenção humana, latência, custo e falhas que podem duplicar operações.
5. Memória procedural versionada, com revisão de ações aprendidas e teste de regressão antes de reutilizar scripts.

## Critério honesto de liberação

**LAB** até que o fluxo de instalação, reinicialização, cancelamento e retomada seja validado em um navegador desktop real, com pelo menos um conjunto de tarefas end-to-end cuja conclusão seja verificada independentemente do modelo. Nenhum número de unit tests, por si só, demonstra confiabilidade de produção.
