# NavegaAI Cognitive Runtime — critérios de qualidade

**Status:** branch de engenharia, não release estável. Não há paridade comprovada com Claude, ChatGPT ou outros agentes.

## Melhorias implementadas

- **Fronteira de confiança:** conteúdo inicial do DOM passa a ser uma observação externa de prioridade inferior à mensagem de sistema.
- **Política determinística:** cliques são avaliados pelo DOM real (papel, nome, link, tipo de botão e formulário). Botões neutros que enviam formulários ou levam a operações financeiras precisam de autorização.
- **Autorização vinculada ao alvo:** verificamos a identidade estrutural do alvo novamente depois da aprovação. Não incluímos o conteúdo dos campos nesse identificador.
- **Visão opcional do runtime:** a opção `visionEnabled` da interface é respeitada pelo navegador gerenciado. Capturas JPEG têm limite de 3 por tarefa e de 1,5 MB cada; são transitórias e não são registradas no SQLite.
- **Evidências sem conclusão falsa:** um envio, pagamento, compra ou exclusão não é declarado concluído somente porque a página mudou visualmente.

## Critérios para aceitar uma versão estável

1. Testar instalação e operação completas com extensão MV3 no Chrome desktop.
2. Validar pelo menos 100 tarefas reais autorizadas com verificadores independentes, incluindo Gmail com conta de teste.
3. Medir taxa de sucesso, falsas conclusões, latência, custo e recuperações após erros.
4. Testar ataques de prompt injection, alterações no DOM durante aprovações e recuperação após interrupções.
5. Validar segurança do armazenamento de segredos, dados pessoais, autenticação, isolamentos de perfis e rede.
6. Comparar o mesmo benchmark com outros agentes antes de declarar equivalência.

## Limitações conhecidas

- O navegador gerenciado continua separado do Chrome pessoal e utiliza logins próprios.
- A visão depende de um modelo OpenRouter com suporte a imagens e autorização do usuário.
- Evidência de interface não equivale à confirmação independente do serviço externo.
- O armazenamento local ainda conserva o texto das solicitações em SQLite e precisa de retenção e proteção apropriadas para produção.
- Não foi validada a extensão completa em um Chrome desktop autenticado neste ambiente.
