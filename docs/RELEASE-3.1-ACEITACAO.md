# NavegaAI 3.1 Professional — Release Candidate e critérios de aceite

## O que mudou no código

1. **Modo Manual para Runtime Playwright:** solicitação, decisão, cancelamento e expiração; evento de auditoria para aprovação e recusa. Aprovação vinculada a `job` e `requestId` de uso único; dados de campos não são exibidos no aviso. O botão **Aprovar** do painel (`yes`) foi ligado à API `POST /tasks/{id}/decision`.
2. **Provas específicas:** `click` retorna um `action_id` aleatório; `verify` exige o mesmo identificador e estado novo observável. Não é permitido iniciar outra alteração sem tratar a verificação pendente. A confirmação genérica da página não prova envios anteriores.
3. **Segurança de navegador e execução:** verificação de origem antes de ler ou agir; proteção contra dupla inicialização de Chromium no mesmo perfil; solicitações idempotentes identificadas por hash de parâmetros, de modo que um ID reutilizado com permissões diferentes é rejeitado.
4. **Limites operacionais:** aprovação expira após 120 s e execução de uma tarefa tem limite de 10 minutos, além dos limites preexistentes de chamadas e ferramentas. Ações incertas não são repetidas automaticamente.
5. **Decisão para ações sensíveis:** modo Automático não envia formulários de alto risco sem permissão. Modo Manual pode permitir um envio explícito após aprovação pontual. Compras e transferências continuam exigindo a permissão financeira independente (não exposta pela interface padrão).
6. **Instalação mais limpa no Windows:** runtime instalado no ambiente virtual `.venv`, isolado das dependências Python do sistema.
7. **Origens de extensão:** se `NAVEGA_EXTENSION_ORIGIN` estiver definida no processo local, apenas o ID de extensão especificado será aceito no CORS do runtime (além da autorização Bearer).

## O que foi testado

- Testes Node de política, isolamento de aba, interface, conector, auditoria e regressões históricas.
- Testes Python de aprovação, recusa, cancelamento, nonce incorreto, concorrência de inicialização, persistência, API autenticada e interação em Chromium sintético.
- Verificação de sintaxe dos módulos e manifestos separados Standard/Advanced.

## O que AINDA não está aceito para produção

- Não há teste completo da extensão instalada em Chrome desktop com todas as permissões e o runtime interligados. Tentativa de Chromium headless no ambiente retornou zero service workers da extensão; o navegador abriu, mas isso **não comprova** instalação funcional.
- Não há teste real com Gmail autenticado nem confirmação do lado do servidor sobre envio.
- Não foi medido um benchmark comparativo com Claude/ChatGPT em um conjunto independente de tarefas.
- Não há mecanismo de replay em vídeo nem proteção demonstrada contra toda forma de prompt injection.
- O banco SQLite local armazena texto de tarefas sem criptografia em repouso; use perfil e computador confiáveis.
- O runtime não opera com o computador desligado; agendamentos duráveis independentes ainda não foram implementados.
- Segurança não foi submetida a auditoria externa e a lista heurística de ações sensíveis não substitui autorização por consequências.

## Critérios objetivos para promoção a 3.1 estável

- Instalação no Chrome desktop sem erros, painel e worker executando, por duas reinicializações seguidas.
- Fluxos reais completos em contas de teste: Gmail rascunho, envio aprovado, navegação entre domínios e múltiplas conversas.
- Aprovações funcionam nos dois sentidos; recusa não dispara ação; expiração não dispara ação.
- Fechamento de aba não faz trabalho repetido; cancelamento e reinício não repetem envios indeterminados.
- Cópia do relatório de auditoria para cada cenário, com registro da ação, decisão, tentativa de verificação e estado terminal.
- Medição de taxa de conclusão e latência em cenários independentes; nenhum sucesso atribuído apenas ao texto do modelo.

**Status atual: Release Candidate para testes supervisionados, não versão de produção certificada.**
