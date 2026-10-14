# NavegaAI 1.3 — Relatório de integridade e limites

**Estado:** laboratório / beta. Não há alegação de paridade com Claude, ChatGPT ou de produto à prova de falhas.

## Diagnóstico técnico realizado

Na versão 1.2, `metrics.pendingVerification` era um booleano: uma única resposta positiva de `verify_page` podia remover o alerta após várias mutações. A `verify_page` também podia retornar `verified=true` para a presença de uma condição atual, sem evidência de que a ação recém-executada a provocou. Outra falha: se `adapter.execute` lançasse exceção após receber um comando, a tarefa podia informar "nenhuma ação foi realizada", apesar de haver efeito remoto possível. O service worker do Chrome pode reiniciar no meio de uma tarefa; a versão anterior não correlacionava no diagnóstico os comandos iniciados e sem retorno registrado.

## Alterações implementadas

- `src/proof-engine.js`: ledger de ações e provas. Uma verificação forte credita no máximo uma alteração pendente. Alterações sem prova mantêm o estado `needs_review`. Evidências inicialmente fracas podem ser superadas por nova prova forte relativa à mesma ação, mantendo o histórico da tentativa.
- Evidência classificada como `current_state` ou `already_present` não comprova conclusão operacional. `changed_state` é evidência observável de uma mudança, não confirmação de processamento por sistema externo.
- `src/interrupted-run.js`: reconstrução conservadora de operações iniciadas e sem término a partir dos logs de auditoria. NUNCA reproduz automaticamente comandos incertos.
- `src/agent.js`: identifica falha após despacho, emite `indeterminate_action`, e evita declarar que nenhuma ação foi executada quando isso é desconhecido; registra ausência de mudança visual após cliques, sem assumir que o comando falhou.
- `src/chrome-browser.js`: permite provar navegação entre documentos quando a URL mudou dentro da mesma aba autorizada e a URL final satisfaz o critério; não converte isso em prova de envio.
- `src/execution-engine.js`: avalia as provas por operação, adiciona limite de duração de execução de 8 minutos por padrão (configuração interna), distingue timeout de cancelamento e utiliza trilha da auditoria para diagnosticar tarefas interrompidas.
- `src/recovery.js`: expõe erros indeterminados e prova fraca no diagnóstico; o usuário recebe aviso para conferir o site.

## Regras de segurança

1. Aprovações normais podem ser ignoradas pelo usuário no modo Livre; ações bloqueadas pela política permanecem bloqueadas.
2. Nenhum erro de retorno autoriza reenvio automático de pagamento, e-mail, publicação, exclusão ou autorização de conta.
3. Logs omitem valores enviados em campos e chaves de API; não são gravação visual integral.
4. Um comando de clique aceito **não** é prova de conclusão da tarefa.
5. Uma confirmação textual pode aparecer sem que o backend remoto tenha persistido o efeito. Para alta garantia, são necessários verificadores específicos por aplicativo.

## Testes executados

- **83/83 testes automatizados** (incluem cenários para provas fracas, duas mutações/uma prova, despacho indeterminado, reinicialização e mudança de URL).
- Verificação de sintaxe JavaScript: **aprovada**.
- Smoke test DOM usando Chromium headless em página controlada: **aprovado** (não é instalação da extensão).
- Tentativa de iniciar a extensão em Chromium headless: **não validada** — o service worker não foi detectado no ambiente de teste. Também foi tentado Chromium com interface virtual Xvfb; a execução excedeu o prazo disponível, sem confirmação de instalação.
- Gmail autenticado, OpenRouter real, eficácia em sites populares e qualidade de visão: **não testados** nesta entrega.
- Nenhuma métrica de sucesso competitivo, melhora de latência ou superioridade pode ser inferida desses testes.

## Decisões para uma versão de produção

Para uma oferta verdadeiramente confiável será necessário: runtime local persistente com fila transacional; execução com estados recuperáveis por tarefa; replay sincronizado e opcional, com expurgo de conteúdo sensível; visão multimodal comparada ao DOM; integração autenticada a APIs de primeira parte para resultados que exigem confirmação externa; benchmark end-to-end, com casos reais autorizados, a mesma configuração de modelos e avaliação independente; testes de falhas induzidas, atualização, migração, quedas de rede e perda de estado; análise de prompt injection e auditoria de segurança.

**Critério de liberação sugerido:** critérios definidos por fluxos essenciais (ex.: ler página, preencher rascunho, enviar sob autorização), taxa de sucesso por categoria, taxa de falsa conclusão, taxa de ações incorretas, tempo mediano e p95, orçamento por tarefa e zero operações não autorizadas nos testes de regressão. Não inventar metas como se fossem resultados.

## Instalação

Escolha uma única edição. Standard não inclui permissão `debugger`; Advanced inclui e deve ser habilitada somente com consentimento explícito por execução. Descompacte em pasta permanente e carregue `NavegaAI-Extension` em `chrome://extensions` usando Modo do desenvolvedor. Desative a anterior antes dos testes. Nunca considere o pacote laboratório um produto para envio financeiro ou credenciais.
