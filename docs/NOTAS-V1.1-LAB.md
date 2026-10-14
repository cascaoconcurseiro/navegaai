# NavegaAI 1.1 LAB — Relatório de implementação e limites

**Data:** 14/10/2026  
**Status:** prévia de desenvolvimento; não é paridade demonstrada com Claude in Chrome ou ChatGPT Work.

## O que de fato mudou desde 0.7

1. **Conversa desvinculada do ID da aba.** O módulo `conversations.js` cria `conversationId` (UUID), mantém índice persistente de conversas e cópia do estado. `CHAT_LIST` lista conversas; `CHAT_REOPEN` reabre aba e restaura mensagens. O fechamento da aba cancela sua execução, mas conserva a conversa. Ao reiniciar o navegador, referências a abas desaparecidas podem ser reconciliadas.
2. **Painel específico por aba.** A nova conversa usa `chrome.tabs.create`, `chrome.sidePanel.setOptions({tabId,path:'src/panel.html?tab=…'})` e `chrome.sidePanel.open({tabId})`. Um painel com `?tab=` não altera seu alvo quando o usuário ativa outra aba. Não são grupos de abas do Chrome. Essa funcionalidade necessita validação end-to-end em Chrome desktop real.
3. **Correção da conversa e auditoria.** `showThread` usava `visible` indefinido; agora filtra mensagens corretamente. A tela de auditoria não recebia `lastThread`; a atribuição foi adicionada. O fluxo de auditoria agora pode ler apenas eventos da aba pelo índice do IndexedDB. Falhas de persistência de auditoria são sinalizadas na conversa e contabilizadas como ressalvas quando detectadas.
4. **Design do compositor.** Campo de mensagem mais compacto, com modelo, modo de autonomia e envio na mesma região, sem exigir outra barra visível. Erros detalhados ficam na auditoria. Tema claro/escuro mantido; seletor OpenRouter permanece pesquisável.
5. **Streaming experimental.** `parseCompletionStream` agrega eventos SSE, texto e deltas de argumentos de ferramentas mesmo quando pacotes de rede terminam no meio do JSON. O chat exibe um preview progressivo; saídas finais substituem esse preview. Modelos/provedores podem não oferecer compatibilidade uniforme com streaming de ferramentas.
6. **Visão opcional.** `capture_viewport` usa `chrome.tabs.captureVisibleTab` apenas quando a aba vinculada está ativa e a opção de captura visual foi ativada. A captura JPEG é transmitida para o provedor configurado como conteúdo multimodal. Não é usada em registros de auditoria nem memórias. **Desativada por padrão.** Depende de um modelo com entrada de imagem.
7. **Habilidades sugeridas.** Após um resultado com pelo menos uma verificação bem-sucedida, pode surgir uma sugestão de procedimento para confirmação do usuário. Texto com padrões de dados sensíveis é rejeitado. Após aprovação, o procedimento vira um atalho de prompt, **não uma automação de passos recompilada ou validada em múltiplas condições**.
8. **Replay de eventos.** O painel de auditoria agora pode percorrer os eventos e destacar cada um em ordem. **Não é vídeo nem gravação visual do navegador**.
9. **Manutenção da v0.7.** Quatro níveis de autonomia, memória manual por domínio, cron de leitura via Chrome, borda azul, cursor demonstrativo, verificações visíveis e duas edições Standard/Advanced.

## Matriz de status dos marcos pedidos

| Requisito | Situação exata neste pacote |
|---|---|
| 0.8: melhorar erros, rastreabilidade e isolamento | Implementação parcial + regressões automatizadas |
| 0.9: streaming e multimodal | Streaming implementado em cliente SSE; captura visual opcional integrada, não benchmarkada ao vivo |
| 1.0: conversas persistentes e paralelas | ID persistente + recuperação e painel específico por aba; sujeito ao ciclo do service worker |
| 1.0: cron independente com Chrome fechado | **Não implementado**. Cron de leitura pode recuperar até uma ocorrência vencida quando o Chrome reabre e usar aba temporária se a original foi fechada. Não trabalha enquanto o Chrome está fechado. |
| 1.0: aprendizado procedural totalmente automático | **Não implementado**. Há apenas sugestão de prompt com aprovação |
| 1.1: replay e observabilidade | Replay textual de auditoria + métricas anteriores; gravação visual real não implementada |
| 1.1: motor Playwright/CDP/visão com roteamento independente | **Parcial**. Controle DOM e CDP experimental; captura visual opt-in. Sem motor Playwright integrado à mesma sessão |
| Comparação científica com Claude/ChatGPT | **Não realizada** |

## Validações executadas

- `npm run check`: verificação de sintaxe do projeto.
- `npm test`: 40 testes automatizados aprovados no último ciclo, com mocks e lógica pura.
- `python scripts/preview_ui.py`: 5 telas renderizadas em Chromium com APIs Chrome simuladas; verifica auditoria e replay sem `pageerror`.
- Não foi realizado envio real de email, automação com login real, CDP numa sessão Chrome de usuário, nem execução de cron com navegador fechado.

## Como testar no Chrome real

1. Faça backup do ZIP e **desative a edição 0.7** para evitar duas extensões similares.
2. Extraia a edição Standard; instale por `chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação.
3. Abra uma página HTTP(S), clique no NavegaAI e abra a lista de conversas.
4. Crie duas conversas; confira que cada uma usa uma aba distinta. Ative uma tarefa em cada uma, volte entre abas, feche uma e tente reabri-la na lista.
5. Confirme que os históricos permanecem distintos. Verifique os registros em Atividade.
6. Configure a API OpenRouter em Configurações e escolha um modelo com ferramentas.
7. Faça um teste sem alterações irreversíveis: ler uma página de teste, localizar botão, clicar e verificar texto esperado.
8. Ative `streaming` e, em teste separado, `captura visual` com modelo compatível e conteúdo não sensível. Confira resultados e desative depois.
9. Se utilizar Advanced CDP, leia a advertência de risco elevado e habilite só em conta/site de teste.

## Segurança

Nunca confundir o modo Livre com autorização irrestrita do sistema operacional. Alguns comandos permanecem bloqueados. Capturas de tela podem incluir dados pessoais. Salvamento opcional da chave OpenRouter no armazenamento da extensão não é criptografado adicionalmente. Logs podem conter pedidos do usuário, embora argumentos sensíveis das ferramentas sejam omitidos. A cadeia de hashes detecta alterações simples, não é prova inviolável contra ataque local.

## Próximos passos que ainda exigem engenharia

Runtime local autenticado e persistente; Playwright/Stagehand no navegador realmente compartilhado e dentro de sessões isoladas; verificador independente especializado para Gmail/serviços; benchmarks BrowserGym; testes end-to-end completos; roteador de modelos baseado em avaliações reais; armazenamento seguro de credenciais; gravação visual opt-in e retenção criptografada; interface de pausa e retomada persistente após suspensão MV3.
