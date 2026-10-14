# Design System NavegaAI 1.1 LAB

## Premissa

Priorizar conversa, minimizando controles visíveis por padrão, sem esconder ferramentas de auditoria de usuários avançados. Inspirado na densidade e clareza do compositor do Claude, mas não uma cópia de marca ou componentes proprietários. Contraste confortável em tema escuro/tema claro e foco visível para teclado.

## Superfícies

1. **Conversa e compositor:** uma pergunta/resposta por vez, modelo e autonomia como controles pequenos abaixo da entrada; envio na mesma linha; erros técnicos fora do chat.
2. **Modelos:** popover pesquisável com catálogo automático; suporte a ferramentas e, quando declarado, entrada visual. API configurada em Configurações, fora do compositor.
3. **Permissões:** opções Manual / Automático / Livre / Leitura; avisos acessíveis, bloqueio por site e confirmação CDP adicional.
4. **Aba em execução:** borda azul e cursor visível sobre a aba ligada, com status discreto no painel. Cursor é visual, não o cursor físico do Windows.
5. **Atividade:** evento, timestamp, ferramenta, duração, erro e replay textual. Falhas silenciosas detectadas devem aparecer como alertas na trilha.
6. **Memória e habilidades:** conteúdo sob controle do usuário; procedimentos só são reutilizados após aprovação.
7. **Cron:** campo cron, status e resultado; limitado à extensão em funcionamento na edição atual.
8. **Configurações:** explicar claramente onde colar chave OpenRouter; CDP e visão como escolhas opt-in com advertências.
9. **Conversas:** lista de tarefas com botão Ir à aba ou Reabrir; identidade persistente sem grupos de abas.
10. **Relatório:** não usar selo de sucesso sem evidência observável; status `needs_review` com acesso ao erro.

## Referências visuais

No pacote separado **NavegaAI-Design-1.1.zip**, há 12 imagens de conceito geradas para cada área da experiência e 5 capturas reais do HTML/CSS do projeto testado em Chromium com APIs simuladas. As artes conceituais não representam recursos já instalados; podem apresentar rótulos e modelos ilustrativos.

## Diretrizes futuras

- Visualizar progresso sem sobrepor interface com log técnico em excesso.
- Otimizar para painel de 320–480 px; permitir zoom e navegação pelo teclado.
- Tarefas perigosas: modal contendo ação, destino, motivo e efeito esperado.
- Nunca afirmar execução com base apenas no modelo ou no clique.
