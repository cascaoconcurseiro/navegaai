# Relatório técnico — NavegaAI 3.0 Hybrid Runtime LAB (14/10/2026)

## Fatos verificados

- 106 testes JavaScript aprovados na extensão e cliente do Runtime.
- 6 testes Python aprovados, incluindo um fluxo real de DOM Playwright em Chromium sintético (`set_content`, sem navegação HTTP(S)), verificação de mudança após atraso, alvo duplicado, persistência, idempotência, autorização e API local.
- O modo nativo da extensão mantém as funcionalidades v2; o novo motor é **opt-in**, com perfil separado, não o Chrome já autenticado.
- `Store` usa SQLite WAL e reclassifica jobs `queued/running` como `interrupted` após reinício. Não retoma efeitos potencialmente irreversíveis automaticamente.
- API local autentica por token e bloqueia Host/Origin não permitidos; o token é necessário inclusive para `/health`.
- O `workspace` separa conversas, com no máximo três tarefas simultâneas e uma tarefa por workspace por vez.
- Identificador `client_job_id` torna o início idempotente quando a resposta HTTP é perdida.
- O modo Manual da extensão não é elevado silenciosamente a Automático: o Runtime recusa essa seleção até que exista fluxo de consentimento próprio.
- O Runtime não tem integração de vision fallback, classificação proprietária de risco, replay de vídeo, mecanismo completo de aprovações remotas, cron independente ou compatibilidade validada em Gmail.

## Problemas não resolvidos

1. Não foi possível executar navegação HTTP(S) no Chromium do laboratório: a política administrativa retorna `ERR_BLOCKED_BY_ADMINISTRATOR`; não se deve contorná-la.
2. A instalação completa Chrome MV3 com a ponte Runtime não foi validada no desktop do usuário.
3. A integração entre perfis não compartilha logins e essa separação deve ser mostrada ao usuário.
4. A verificação de texto ou URL prova mudança observável, não entrega efetiva de e-mail ou autorização de compra no servidor remoto.
5. O Runtime precisa permanecer em execução no computador; com o computador desligado, tarefas não continuam.
6. Dados de pedidos e resultados ficam em SQLite local sem criptografia de conteúdo em repouso.

## Comparação com as tecnologias analisadas

Playwright MCP emprega snapshots de acessibilidade e referências; neste Runtime, escolhemos Playwright com locators por role/name exatos, sem depender de refs fornecidas livremente pelo modelo. BrowserOS neo usa browser separado e mantém perfil persistente. Adotamos a separação explícita de perfis, mas **não** reproduzimos a profundidade de replay e integração da plataforma.

## Próximos critérios de aceitação antes de lançamento público

- Teste real da instalação em Chrome desktop com comunicação REST entre extensões e serviço local.
- Testes autenticados autorizados (Gmail de teste, formulários SPA, iframe, Shadow DOM, múltiplas abas, redirecionamentos e erro de rede).
- Métricas sobre 100+ tarefas end-to-end, tempo de conclusão, taxa de intervenção, falsas confirmações e custo por objetivo comprovado.
- Aprovações de operações sensíveis com protocolo de consentimento e observabilidade remota, em vez de um bypass inseguro.
- Observabilidade resistente a crash incluindo replay sanitizado, snapshots locais e monitoramento de serviço.
