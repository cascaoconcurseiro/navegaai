# NavegaAI 1.1.1 AuditFix — Auditoria forense e correções

Data: 14 de outubro de 2026. Base: `navegaai-audit-1792000464415.jsonl`, fornecido pelo usuário (não incluído nos pacotes distribuíveis para evitar divulgação de dados da sessão).

## 1. Integridade do arquivo e indicadores

- **371 eventos** com sequência contínua (`seq` 1–371), sem quebra de encadeamento e com **371 hashes SHA-256 válidos**, verificados recalculando o hash dos objetos originais em ordem.
- **6 execuções**, **43 operações de ferramentas**, **6 exceções**, **2 verificações negativas**, **48 chamadas ao modelo**.
- **294,0 segundos** de duração somada das seis execuções, dos quais **281,5 segundos** contabilizados como chamadas ao modelo (**95,7%**) e **11,8 segundos** como tempo de ferramenta (~4%). Somatórios podem ter pequenas diferenças por overhead e arredondamento.
- O modelo registrado em `run_started` nas seis execuções foi `nvidia/nemotron-3.5-lightning:free` com permissão `skip` (Livre). Existe registro anterior de configuração de outro modelo, mas o log, sozinho, não permite afirmar que houve troca errada; a escolha efetiva fica registrada por execução.

| Run (prefixo) | Duração | Chamadas LLM | Ferramentas | Exceções | Verificação | Desfecho registrado |
|---|---:|---:|---:|---:|---|---|
| `f9a364d3` | 16,5s | 3 | 2 | 0 | Nenhuma prova | `needs_review` |
| `5239c6b9` | 27,9s | 8 | 7 | 0 | 1 negativa | `needs_review` |
| `5939c364` | 73,0s | 20 | 20 | 6 | 3 verificações de texto positivas, anteriores a novas mutações | `needs_review` |
| `2e2f7e3d` | 6,5s | 1 | 0 | 0 | Sem ação | `completed` (solicitação descritiva) |
| `6cbb552e` | 14,1s | 2 | 1 | 0 | Somente leitura | `completed` (ação de leitura) |
| `3d49796a` | 156,1s | 14 | 13 | 0 | 1 negativa após tentativa de envio | `needs_review` |

### Evidências concretas

1. **Seis falhas idênticas de inspeção/clique**: eventos `agent_tool_error` nos passos das sequências de log 137, 158, 164, 170, 176 e 182: `Cannot read properties of null (reading 'href')`. O código fazia `p.href` sem validar se a inspeção devolveu `null`. **Causa diretamente corrigida.**
2. **Controle errado selecionado**: eventos das sequências 320 e 328 mostram cliques aceitos em `Mais opções de formatação` durante o fluxo de envio. Uma IA pode escolher uma referência inadequada. A proteção `expectedLabel` foi acrescentada ao contrato de ferramentas: o motor pode barrar um alvo cujo rótulo não corresponde ao declarado pelo agente. **Mitigação, não garantia de interpretação correta.**
3. **Envio não confirmado**: na sequência 351, um clique em `Enviar` foi aceito; na sequência 357, a verificação posterior falhou. O log **não comprova** que um e-mail tenha sido enviado ou não. Não se deve repetir envios por timeout ou ausência de confirmação sem nova avaliação do estado real.
4. **Verificações com falsa sensação de conclusão**: na execução de 73s, verificações de texto positivas foram registradas antes de mais alterações subsequentes. Agora uma nova mutação redefine `pendingVerification=true`, impedindo reaproveitar indevidamente a prova antiga para declarar a tarefa concluída.
5. **Ferramentas inválidas e resultados nulos não eram sempre auditados como erros**: agora contam como `tool_error` e elevam a sinalização de falha.
6. **Chamadas de IA dominam a lentidão**: não seria correto prometer uma melhoria de tempo só com as correções. Será necessário testar modelos diferentes, reduzir rodadas e melhorar o planejamento de ações.

## 2. Correções implementadas

- Validação de `preview` antes de ler `href` ou emitir cliques (`src/chrome-browser.js`), com erro `PREVIEW_INDISPONIVEL` controlado quando o alvo não puder ser inspecionado.
- `expectedLabel` nos esquemas de `click_element`/`fill_element`: compara o nome esperado com o nome observado; a verificação aceita ações legadas sem campo para manter compatibilidade, mas solicita o campo aos modelos novos.
- Proteção contra ação sensível duplicada **na mesma execução**, marcada antes de despachar o comando. Assim, mesmo um erro após o clique não autoriza repetir um potencial envio.
- Bloqueio de repetição do mesmo controle e interrupção após três falhas consecutivas ou três ocorrências da mesma falha, ainda que intercaladas com leituras bem-sucedidas.
- `pendingVerification` é redefinido depois de cada mudança de página; conclusão de ação sem pós-condição vira ressalva explícita no chat e status de revisão.
- Resposta do modelo sem nenhuma ação, embora o usuário tenha feito um pedido operacional claro, passa a `unfulfilledAction` e não pode ser tratada como tarefa executada.
- Retorno `null`, ferramenta desconhecida e argumentos inválidos agora criam erro rastreável, não um êxito silencioso.
- Gravação de auditoria serializada para impedir colisões de `seq`/hash sob concorrência (`src/audit.js`). No início da execução, uma falha na gravação impede ações do navegador; eventos assíncronos são drenados antes do desfecho.
- `execution_crashed` registra um erro inesperado do worker no lugar de esconder rejeições da execução em segundo plano.
- `traceOutcome` distingue explicitamente a condição **não confirmada** de um comando aceito.

## 3. Validação realizada

- `npm test`: **52 testes automatizados aprovados** (os 40 anteriores mais 12 novos), incluindo regressões para os casos acima.
- `npm run check`: sintaxe dos módulos JavaScript válida.
- `python scripts/smoke_browser.py`: teste em Chromium headless real de snapshot, alvo, input, contenteditable, clique, verificação assíncrona e rejeição de referência obsoleta. O teste **não instala a extensão**, não utiliza Gmail autenticado nem a API OpenRouter.
- Manifestos Standard/Advanced revisados; Standard sem permissão `debugger`; Advanced com `debugger` e consentimento de execução.

## 4. Limitações conhecidas

- O relatório não verifica envio real de e-mail. Um clique aceito não equivale a confirmação de entrega. Faça o primeiro teste manualmente em uma conta de teste, conferindo a pasta Enviados e o recebimento na outra conta.
- A heurística de ações solicitadas (para detectar respostas sem operações) não entende perfeitamente qualquer frase em português; pedidos ambíguos podem exigir revisão.
- `expectedLabel` protege contra divergências de rótulo; se a IA escolher tanto a referência quanto o rótulo errado, a ferramenta não tem como identificar a intenção por esse recurso isoladamente. O passo seguinte é construir um verificador de objetivo independente.
- Modelos gratuitos podem variar em confiabilidade e latência. Não existe benchmark real versus Claude/ChatGPT ou garantia de mais velocidade.
- Execuções de Chrome Manifest V3 ainda dependem do ciclo de vida do service worker; esta atualização não acrescenta um runtime local persistente.
- Auditoria encadeada por hash não equivale a prova criptográfica inviolável ou a rastreamento de todas as ações internas do Gmail.

## 5. Roteiro do teste real com Gmail

1. Atualize a extensão Standard a partir do pacote 1.1.1. **Faça backup e desative as versões anteriores** para não testar duas extensões semelhantes.
2. Abra uma página de teste simples; execute `get_page`, preenchimento, clique e verificação. Exporte a auditoria e confira o identificador da execução.
3. No Gmail, faça um teste de **rascunho** antes de tentar enviar. Verifique se destinatário, assunto e corpo correspondem ao pedido e se nenhum controle de formatação foi selecionado indevidamente.
4. Para envio, use uma conta de teste e monitore as pastas Enviados e Caixa de entrada. Se a resposta não for confirmada, **não repita o clique Enviar imediatamente**.
5. Exporte os novos logs após esse teste; correlacione o resultado real com as etapas do agente para separar erro de modelo, DOM, evento de UI, confirmação e provedor.
