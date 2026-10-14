# NavegaAI 3.2 Professional RC — relatório de engenharia e aceite

## Resumo

Esta entrega **não está certificada para produção** nem comprovada como equivalente aos melhores agentes comerciais. A base 3.1 foi corrigida e reforçada onde havia defeitos claros em segurança e recuperação. A meta foi aumentar a confiabilidade comprovável, não declarar perfeição.

## Mudanças efetivamente implementadas

| Área | Modificação | Evidência de teste |
|---|---|---|
| Privacidade entre conversas | Um perfil Chromium persistente separado por workspace, identificado por hash | Teste com Chromium real comprovou ausência de compartilhamento de cookie |
| Proteção de domínios | Interceptação de requisições de navegação de documentos, abortando destinos fora da lista permitida antes do carregamento | Testes de integração e validação de origens; pendente suíte de sites reais |
| Aprovação inteligente | `auto` solicita consentimento quando o controle é classificado como sensível; `review` continua por ação; `read_only` bloqueia mutações | Teste de aprovação com clique "Enviar" e bloqueio até a decisão |
| Retomada | Identificador de origem da execução, objetivo anterior, URL do último checkpoint e nova observação; ações irreversíveis não são repetidas automaticamente | Testes de retomada e cruzamento indevido de conversas |
| Corridas e duplicação | Job ID idempotente mesmo quando a URL registrada muda após checkpoints | Regressão de POST repetido aprovada |
| Diagnóstico | Ferramenta `diagnose` expõe tipos de falha de rede e JavaScript sem corpos, headers e tokens | Validação de segurança no executor; não é telemetria completa de rede |
| Autorrecuperação | Classificação dos erros de ferramenta e instruções de reobservação; interrupção após três alterações sem progresso | Testes existentes e inspeção do fluxo |
| Conexão runtime | Token local persistente entre reinicializações, criado com permissão restrita quando disponível | Inicialização e API autenticada; reinício real do Windows pendente |
| Contexto não confiável | Separação explícita de observações de página e instruções do usuário, somada a controles no executor | Política e código; **não** prova imunidade a prompt injection |

## O que foi verificado

- Testes de unidade e integração Node existentes.
- Testes Python do runtime, incluindo perfil separado no Chromium, fila de aprovação, contexto de trabalho, prova de ação e API autenticada.
- Sintaxe JS/Python, manifesto Chrome, e diferença de permissões nas edições Standard/Advanced.
- Navegação em contas comerciais autenticadas **não** foi executada neste ambiente.
- Uma tentativa de iniciar a extensão completa no Chromium com display virtual excedeu o prazo. Esse é um bloqueio de validação, não sucesso.

## Bloqueios para promoção a versão estável

1. **E2E no Chrome de usuário:** instalação, service worker, painel por aba, OpenRouter real, permissões e troca de sites.
2. **Bateria de fluxos de serviço:** Gmail de teste, rascunho, envio com aprovação, falha de autenticação e verificador externo de envio; sem compras reais.
3. **Avaliação contra concorrentes:** corpus independente, taxa de conclusão, falsos sucessos, custo, latência e intervalos de confiança.
4. **Prompt injection:** suíte adversarial e defesa além de instruções ao modelo e escopo do executor.
5. **Autonomia persistente:** scheduler real independente do Chrome, além de checkpoints recuperáveis entre reinicializações completas; atualmente tarefas interrompidas precisam de retomada explícita.
6. **Privacidade:** criptografia em repouso para histórico e armazenamento seguro de chaves usando mecanismo do sistema operacional. SQLite usa permissões locais, **não criptografia de dados**.
7. **Replay visual:** histórico estruturado atual não é gravação de vídeo nem reconstituição completa do DOM.
8. **Segurança externa:** auditoria independente, assinaturas/distribuição, revogação de tokens e validação em múltiplas versões do Chrome/Windows.
9. **Memória:** habilidades reutilizáveis continuam simples; não existe ainda compilador de procedimentos verificáveis com aprendizado de execução.
10. **Visão multimodal do runtime:** a extensão possui captura opcional, mas o runtime Python ainda não contém um controlador visual multimodal maduro.

## Modelo de ameaça residual

- Sites podem apresentar instruções maliciosas: nunca tratar conteúdo externo como autoridade; autorização por origem e ação é necessária, mas insuficiente para evitar todo ataque.
- Extensão nativa opera no Chrome do usuário; motor Playwright usa outro perfil por conversa. **Os logins da 3.1 não migram automaticamente** por privacidade.
- A ação de clique aceita pelo navegador não comprova operação concluída no servidor. A verificação utiliza mudanças de interface e continua limitada.
- Execuções em modo Livre aumentam risco; transferências e compras exigem autorização financeira separada. Aprovações por rótulos heurísticos não substituem uma política semântica de consequências.
- O uso de `context.route` prioriza controle da navegação, mas pode reduzir desempenho do cache e bloquear iframes legítimos de origens não autorizadas. Autorize origens adicionais conscientemente.

## Instalação e diagnóstico

1. Extraia o ZIP em uma pasta permanente.
2. Carregue a pasta `NavegaAI-Extension` pelo modo desenvolvedor do Chrome.
3. Instale e inicie o runtime pelo BAT na pasta raiz (opcional; requer Python e instala Chromium Playwright).
4. Em Configurações escolha Runtime e configure o token. O perfil gerenciado exige **novo login por conversa**.
5. Execute um teste de leitura e depois o formulário de laboratório. Comece com modo Manual.
6. Para investigar falhas, exporte a auditoria e registre o ID da execução. Não envie chaves, cookies ou capturas com dados sensíveis.

## Decisão de lançamento

**RELEASE CANDIDATE — validação externa requerida.** Não utilizar para operações financeiras, exclusões permanentes ou fluxos críticos sem supervisão.
