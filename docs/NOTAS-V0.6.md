# NavegaAI 0.6.0 — notas técnicas e limitações

**Data:** 14/10/2026

## Incidentes reproduzidos e correções

### 1. Navegar de AliExpress/OpenRouter para Gmail

A versão 0.5 rejeitava qualquer origem diferente da origem inicial no método `ChromeBrowser.execute('navigate_tab')`. Isso impedia até uma navegação solicitada pelo usuário. A partir da 0.6, o agente mantém o mesmo `tabId` e autoriza, conforme o modo escolhido, origens adicionais dentro daquela execução. Bloqueios explícitos de domínio continuam valendo. Um redirecionamento para uma origem não autorizada impede operações adicionais. Links normais também são verificados antes do clique se tiverem destino HTTP(S).

### 2. Modo Somente leitura confundido com cron

O erro `Automação agendada: ações de escrita estão proibidas.` foi substituído por uma mensagem que realmente descreve o modo Somente leitura. Somente tarefas disparadas por `chrome.alarms` são cron. Uma conversa interativa não deve herdar o modo Somente leitura apenas porque existe um cron configurado.

### 3. Aprovação manual / automática / livre

O NavegaAI possui quatro modos:

- **Manual (`review`)**: confirma cada operação que pode modificar a interface, inclusive navegação.
- **Automático (`auto`)**: executa ações comuns e navegação entre domínios sem interromper cada passo. Para ações classificadas como alto risco, solicita aprovação.
- **Livre (`skip`)**: após o usuário habilitá-lo conscientemente, não solicita aprovações normais de ferramentas e libera sites não explicitamente bloqueados para a tarefa atual. O navegador ainda aplica suas próprias permissões e o NavegaAI mantém bloqueios técnicos explícitos (como campos de senha, operações financeiras e exclusão permanente).
- **Somente leitura (`read_only`)**: impede operações mutáveis. Usado pelo scheduler.

Esta classificação é **heurística**, não é um classificador de segurança baseado em modelos treinados pela Anthropic. O modo Livre pode causar ações indesejadas, como envio de e-mails; não usá-lo em sites críticos.

### 4. Conversas por aba

O botão **+** cria uma nova aba (inicialmente `https://www.google.com/`) e tenta abrir um painel específico para ela. Cada `tabId` tem uma conversa persistida sob chave própria (`navegaThreadV1:<tabId>`), com histórico das mensagens e dos eventos. Ao voltar para a aba antiga, a extensão recupera seu histórico. Fechar uma aba solicita o cancelamento de sua execução. Uma nova conversa NÃO altera a aba de uma conversa anterior.

### 5. Tarefas concorrentes

O agente foi movido para o service worker, com um `AbortController` por aba, pendências de aprovação por execução e lock independente por `tabId`. O service worker Manifest V3 **não é um serviço de execução permanentemente ativo**: o Chrome pode encerrá-lo. Se reiniciar durante uma tarefa, a execução pode interromper. O NavegaAI identifica uma conversa que ficou marcada como ativa sem agente real e apresenta erro recuperável, em vez de fingir conclusão. Para confiabilidade de sessões longas, é necessário migrar o executor para um processo nativo local, navegador gerenciado ou serviço persistente.

### 6. Cron, memória e auditoria

Cron permanece restrito à leitura, criado com expressões de cinco campos e `chrome.alarms`; a aba de origem precisa continuar existente e autorizada. Não há garantia de executar com o Chrome fechado. A memória é manual e segmentada por origem; não existe aprendizado automático de procedimentos nesta versão. Os logs da auditoria registram início, ferramenta, aprovação, risco, duração, encerramento e runId/tabId; mensagens de chat são salvas localmente por aba. A cadeia de hashes é uma detecção simples de adulteração, não prova criptográfica de integridade contra atacantes com acesso total ao armazenamento.

### 7. OpenRouter, Chrome e CDP

Catálogo completo do OpenRouter, cache de seis horas e pesquisa de modelos continuam presentes. A edição Standard não inclui `debugger`. A edição Advanced declara essa permissão na instalação, mas sua utilização continua desligada por padrão e precisa de autorização de risco elevado por execução. Escolher `skip` não concede automaticamente o CDP, que é um privilégio separado. O modo Advanced **não** é um servidor CDP irrestrito exposto para os modelos.

## Testes

Execute `npm test` e `npm run check`. Testes automatizados de regressão verificam os modos, navegação AliExpress → Gmail com funções simuladas, permissões, duas sessões em abas diferentes, cancelamento, memória, agendamentos e componentes existentes. Testes usam mocks; não demonstram confiabilidade de envio real de Gmail, CDP real ou integração BrowserOS real.

## Testes manuais no Chrome recomendados

1. Na edição Standard, escolha Automático, inicie em uma aba qualquer e solicite navegar para outro domínio; confirme que o mesmo tabId é mantido.
2. Teste o modo Livre em páginas de demonstração, nunca em checkout ou dados críticos. Confirme que envios não exigem aprovação normal, mas operações bloqueadas continuam bloqueadas.
3. Clique `+` e verifique a criação de uma nova aba e o histórico independente ao voltar à anterior.
4. Execute duas tarefas de leitura em abas diferentes e interrompa uma sem cancelar a outra.
5. Feche a aba de uma tarefa para conferir cancelamento e limpeza da borda azul.
6. Verifique se o agendamento continua apenas de leitura e se os logs apresentam eventos por runId.
7. Repita testes depois de recarregar o Chrome; é esperado que tarefas não concluídas precisem reiniciar.
