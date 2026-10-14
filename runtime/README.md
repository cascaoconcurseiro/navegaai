# NavegaAI Desktop Runtime (3.2 RC)

Este é um **processo local opcional**, separado da extensão. Ele abre **um Chromium com **perfil persistente isolado por conversa****, usando Playwright, e não acessa nem importa os cookies do Chrome pessoal. A interface principal continua sendo a extensão, e o modo nativo permanece o padrão.

## Instalação no Windows

1. Instale Python 3.11+ (marque `Add Python to PATH`).
2. Execute `instalar-runtime-windows.bat` uma vez (instala FastAPI, httpx, Playwright e o Chromium gerenciado).
3. Execute `iniciar-runtime-windows.bat`. O terminal exibirá um **token local**; mantenha-o em segredo e deixe a janela aberta.
4. No Chrome, carregue a extensão (pasta contendo `manifest.json`). No NavegaAI, Configurações → Motor de automação → **Runtime local · Playwright**, e informe `http://127.0.0.1:8765/` e o token copiado.
5. Selecione OpenRouter (ou outro provedor compatível), chave e modelo **que suporte chamadas de ferramentas**. Para usar outros sites além da aba atual, preencha a lista de origens autorizadas, como `https://mail.google.com`.
6. Execute primeiro uma leitura e depois testes de formulário em conta/site de teste. O perfil gerenciado exige login separado, feito manualmente na janela Chromium que ele abrir.

Se estiver no Linux/macOS, dentro da pasta raiz do projeto:

```bash
python -m pip install -r runtime/requirements.txt
python -m playwright install chromium
python -m runtime.server
```

O token permanece em `~/.navegaai-runtime/access.token`, com permissões restritas quando suportadas. Para substituí-lo, use `NAVEGA_RUNTIME_TOKEN` com ao menos 32 caracteres, ou pare o runtime e regenere o arquivo local. A chave do provedor é encaminhada **apenas via loopback** da extensão para o Runtime, mantida na memória e **não gravada** no banco SQLite do Runtime. Os pedidos, os estados e a trilha de eventos são gravados no disco em `~/.navegaai-runtime/state.sqlite3`; esse armazenamento tem proteção por permissões do sistema onde disponível, **não criptografia de dados em repouso**.

## Capacidades e segurança

- Serviço escutando apenas `127.0.0.1:8765` (não publicar via proxy/túnel).
- Autenticação por token Bearer e restrição CORS a extensões Chrome. Abas web comuns não têm permissão de acesso cross-origin.
- Perfis Chromium segregados por conversa (cookies e storage independentes); até três tarefas simultâneas. A versão 3.2 usa novos diretórios de perfil: entre novamente nos serviços utilizados.
- Etapas `observe`, `diagnose`, `navigate`, `click`, `fill`, `verify` com snapshots de acessibilidade, localização exata e esperas automáticas do Playwright.
- Persistência SQLite, auditoria encadeada por SHA-256, reconciliação de pedidos pelo mesmo ID e nenhum replay automático de operações interrompidas.
- O modo **Manual** agora solicita aprovação por ação modificadora no painel da extensão. A aprovação vale somente para aquela ação, expira e fica vinculada ao identificador da execução. O painel precisa permanecer acessível para aprovar; se fechado, a solicitação expira sem executar.
- Envios, compras, exclusões e publicações têm bloqueio conservador no modo integrado: o botão Livre do Chrome **não** autoriza esses efeitos no Runtime. A API permite uma autorização adicional explícita somente em cenário opt-in; a interface da extensão ainda não oferece esse procedimento.
- Ao fechar o painel ou a aba da extensão, o processo local pode continuar a tarefa em seu navegador separado. Ao reiniciar o próprio Runtime, tarefas em andamento viram **interrompidas**, sem replay automático. Digitar "continue" em uma tarefa pausada inicia nova execução vinculada à anterior, reobservando a página e usando o último checkpoint conhecido.
- O navegador remoto não funciona com o computador desligado. Agendamentos existentes do NavegaAI continuam dependendo do Chrome aberto: **este pacote ainda não inclui um agendador independente no runtime**.

## API local para diagnóstico

Com um token válido:

```bash
curl -H "Authorization: Bearer SEU_TOKEN" http://127.0.0.1:8765/health
```

Endpoints: `POST /tasks`, `GET /tasks/{id}`, `POST /tasks/{id}/decision`, `POST /tasks/{id}/cancel`, `GET /tasks/{id}/audit-integrity`.

## Testes

```bash
python -m unittest discover -s runtime/tests -v
```

A suíte usa Chromium real com `set_content()` em página sintética, porque a política administrativa do ambiente de desenvolvimento bloqueia navegações HTTP(S). Isso **não comprova** login, navegação autenticada, Gmail real ou desempenho comparável ao Claude.
