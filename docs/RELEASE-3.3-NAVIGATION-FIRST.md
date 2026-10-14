# NavegaAI 3.3 RC — Navigation-first / HTTPS reliability

Status: **candidata para testes controlados**. Não foi homologada em um Chrome desktop autenticado e não possui benchmark comprovado contra Claude.

## Problemas tratados no pacote 3.3

1. Nova conversa começa em about:blank ou chrome://newtab, sem forçar navegação externa ao Google. O agente recebe uma observação navigationOnly e deve usar navigate_tab com URL HTTP(S) explicitamente solicitada.
2. chrome.tabs.update resolve antes de o documento estar necessariamente carregado. A execução aguarda a URL comprometida e estado complete, sem aceitar o status obsoleto da página anterior.
3. Timeout ou interrupção gera resultado indeterminado, sem repetir operações potencialmente irreversíveis.
4. Páginas chrome-error:// são classificadas como falha/bloqueio de navegação. Restrições de rede não são contornadas.
5. Escopo por origem continua obrigatório antes da leitura do DOM; redirecionamentos para origem não autorizada bloqueiam a próxima operação.

## Evidência local

Na árvore de desenvolvimento completa, foram aprovados 118 testes JavaScript, 21 Python, smoke test de motor DOM em Chromium e verificação das edições Standard (sem debugger) / Advanced CDP (com debugger). Esses números **não são benchmarks de produtividade ou segurança**.

## Pendências para validação

- Importar e revisar a árvore-fonte completa e seus testes nesta branch.
- Validar instalação Chrome MV3 desktop, service worker, runtime e interações com HTTPS real.
- Executar tarefas Gmail em conta de teste com conferência de entrega; nenhum envio real foi validado.
- Medir taxa de sucesso, custo e recuperação em tarefas reprodutíveis.
- Manter ações financeiras, publicação e envios sem repetição automática após resultados incertos.

**Esta branch contém somente um subconjunto da implementação; não faça merge como release instalável.**
