# NavegaAI 0.7.0 — experiência, rastreabilidade e provas de execução

**Status:** beta local para Chrome Manifest V3. **Não há alegação de equivalência com o Claude, ChatGPT Work ou navegadores agênticos comerciais.** Recursos mais avançados dependem de instalação e testes em Chrome desktop real. O código não envia e-mails reais durante a suíte de testes.

## O que mudou em relação à 0.6

### Painel para uso cotidiano

- Seletor de **modelo** e modo de **aprovação** diretamente junto à caixa de entrada. Permanecem disponíveis Manual, Automático, Livre e Somente leitura.
- Indicador de conexão do provedor na caixa de entrada. Clique para abrir configurações.
- Em **Configurações → Conexão**, o campo de **Chave de API do OpenRouter** agora é o primeiro campo quando OpenRouter está selecionado. Um link abre a página oficial `https://openrouter.ai/settings/keys`. Os identificadores e endpoints manuais ficam num menu avançado.
- **Modo avançado de conversa** é opt-in: apenas com a opção “Mostrar etapas técnicas e erros no chat” os eventos resumidos aparecem misturados às mensagens. A configuração padrão mostra somente pedidos e respostas; erros técnicos ficam em **Atividade e auditoria**.
- Exibição contextual de falhas sem stack traces no chat. Há uma barra de aviso para erros de operação da interface.

### Trilha de auditoria e proveniência

- Cada solicitação recebe `runId`, `tabId`, evento `run_requested`, modo de permissão, provedor/modelo e prévia do pedido.
- A execução registra solicitações e respostas de modelos, chamadas de ferramentas, durações, decisões, verificação, erros e encerramento.
- O pedido completo permanece no **histórico local daquela conversa**. A trilha de auditoria global preserva apenas uma prévia redigida (até 600 caracteres) para evitar armazenamento redundante de dados sensíveis. Há exportação JSONL global e JSON por aba/conversa.
- A lista de auditoria é persistida em **IndexedDB** com hash encadeado, até 5.000 eventos. Os registros anteriores de `chrome.storage.local` são migrados para IndexedDB no primeiro acesso sem apagá-los da versão antiga. O caminho de fallback em armazenamento local permanece para ambientes sem IndexedDB.
- O encadeamento de hashes facilita a identificação de edição casual, mas **não é uma assinatura digital, trilha imutável ou proteção contra adversário que controle o banco**.
- Argumentos de texto digitado, tokens de API e partes potencialmente sensíveis dos critérios de verificação são omitidos nos registros de ferramenta. Consultas ao modelo são enviadas à API selecionada conforme a tarefa; isso NÃO significa que o provedor receba apenas esses logs sanitizados.
- Exibição de métricas na auditoria: tempo de resposta do modelo, tempo de ferramentas, número de falhas e prova de resultado quando disponível.

### Prova de resultado, e não apenas “clique enviado”

Nova ferramenta `verify_page`: busca condições observáveis de confirmação na **aba atual**, sem executar scripts arbitrários fornecidos pelo modelo. Exemplos: texto visível de confirmação, fragmento de URL e título. Os critérios são avaliados de forma determinística, e o retorno contém `verified: true/false` com verificações separadas.

Diferenciamos:

1. ferramenta invocada;
2. comando aceito pelo navegador;
3. nova observação realizada;
4. **resultado explicitamente confirmado por `verify_page`**;
5. objetivo final realmente comprovado (pode exigir mais verificações específicas do site).

`get_page` depois de um clique não comprova, por si só, a conclusão do objetivo. Ações modificadoras sem prova, falhas de ferramenta, verificações falhas ou parada por limite de etapas resultam em `needs_review` (*precisa de revisão*) e não em sucesso incondicional.

Por exemplo, numa simulação de **AliExpress → Gmail**, clicar em “Enviar” sem prova independente do envio retorna `needs_review`. **Nenhum e-mail foi enviado em teste real.**

### Desempenho: melhorias implementadas, não benchmarks alegados

- Polling da interface: intervalo de segurança de 600 ms → 2.500 ms, com notificações de alteração via `chrome.storage.onChanged` para atualização mais rápida quando houver eventos.
- Conversas só reconstruídas na interface quando as mensagens visíveis mudam. Antes a interface remontava mensagens mesmo em eventos internos não visíveis.
- O painel deixou de importar o módulo completo de agente/browser na inicialização.
- O intervalo mínimo de espera antes da reobservação pós-ação mudou de 180 ms para 85 ms. **Isto não garante que o site tenha terminado de atualizar**; a ferramenta `verify_page` é o mecanismo explícito de checagem.
- Logs novos usam IndexedDB, evitando regravar arrays grandes de auditoria em `chrome.storage.local` para cada ferramenta.
- Tarefas agora registram separadamente a latência de cada chamada ao modelo e de cada ferramenta, possibilitando futuras otimizações dirigidas por dados.

Nenhuma porcentagem de melhoria de velocidade está sendo afirmada: sem execução comparativa no Chrome real e chamadas reais aos provedores, isso seria especulativo.

## Como conectar OpenRouter

1. Abra o painel do NavegaAI em um site comum.
2. Clique em **Configurar API** ou no indicador **Adicionar chave** junto da caixa.
3. Selecione **OpenRouter · catálogo automático**.
4. Acesse `https://openrouter.ai/settings/keys`, obtenha sua chave e cole no campo **Chave de API do OpenRouter**.
5. Escolha se quer manter a chave apenas na sessão ou armazená-la entre reinicializações (menos seguro).
6. Clique em **Salvar alterações**.
7. Na caixa de chat, abra o menu do modelo e selecione um modelo que suporte tools; a lista é sincronizada com a API pública do OpenRouter.

A presença de texto no campo indica apenas uma chave informada, **não valida que ela esteja ativa**. Uma primeira chamada real pode retornar erro de autenticação, orçamento ou compatibilidade de ferramentas, que aparecerá na auditoria.

## Como ler a trilha

- Botão de relógio/atividade no cabeçalho ou **Ver atividade** abaixo da mensagem.
- Filtros: Todos, Ferramentas, Falhas, Aprovações.
- Métricas: quantidade de eventos, falhas e intervalo entre primeiro e último evento.
- **Exportar esta conversa** inclui registros associados à aba. **Exportar auditoria completa** inclui todos os registros persistidos.
- Para exibir detalhes também no chat, ative **Configurações → Experiência de conversa → Mostrar etapas técnicas e erros no chat**.

## Persistência, memória e cron — o que NÃO mudou

- Uma conversa vinculada à sua aba continua com histórico por `tabId` e outra conversa é criada em nova aba.
- A memória por site continua **manual** (adicionar/editar-excluir); não existe aprendizado automático verificado.
- Os cron jobs continuam **apenas de leitura** com `chrome.alarms`; Chrome fechado, aba fechada ou service worker suspenso **não dão garantia de execução**.
- A integração BrowserOS neo continua desativada para controle de sites até existir isolamento verificável por aba.
- O modo Livre pula aprovações normais, mas limites de segurança e bloqueios explícitos permanecem. Não configure testes de compras, exclusão, gestão de permissões ou credenciais em sites importantes.
- Edição Standard não declara `debugger`. Edição Advanced declara e exige consentimento por execução; não é uma permissão opcional revogável a qualquer momento dentro da extensão.

## Testes desta entrega

- `npm run check` — validação sintática de módulos.
- `npm test` — 34 testes automatizados incluindo fluxo entre sites simulado, permissões, cron, auditoria, correspondência do modo avançado, verificação objetiva e detecção de `ok:false` silencioso.
- Auditoria estática: IDs da interface e referências JavaScript, manifesto das duas edições e integridade estrutural dos ZIPs.

**Pendente:** instalação interativa na sua versão do Chrome, teste real de envio/recebimento Gmail, teste do CDP real, validação da interface em um side panel de extensão instalado, testes reais do neo, benchmarks de latência contra Claude/ChatGPT. O Chromium headless do ambiente não conseguiu completar nem uma captura de tela simples, então nenhuma captura visual foi apresentada como evidência de execução real.

## Roadmap recomendado de engenharia

1. **E2E real**: harness Playwright/Chrome extension com permissões reais, laboratório React/iframe/Shadow DOM e benchmark de sucesso comprovado.
2. **Motor multimodal opcional**: screenshot + referências de acessibilidade; CDP supervisonado por aba, com métricas de fallback.
3. **Executor persistente**: serviço local autenticado para agendamentos e longas tarefas, filas, retry com idempotência e recuperação após restart.
4. **Memória procedural com aprovação**: reconhecer sequências repetidas e transformá-las em procedimentos reutilizáveis somente após verificação independente e aceite.
5. **Segurança ampliada**: políticas específicas de risco, isolamento de segredos, logs cifrados com chave do usuário, filtragem de conteúdo de sites não confiáveis e testes adversariais.
6. **Streaming incremental**: respostas de modelos com tool-call streaming validado por provider, sem executar chamadas incompletas.
7. **Métricas reais**: sucesso por tarefa, false positives, custo, latência P50/P95 e regressões por interface/modelo.

A meta de produto é uma interface limpa com **prova auditável de cada ação**, e não apenas um cursor que se move e textos que afirmam sucesso.
