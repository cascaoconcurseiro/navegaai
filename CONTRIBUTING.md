# Contribuindo com NavegaAI

## Política de alterações

- Faça mudanças em uma branch e abra um pull request; nunca coloque chaves ou perfis do Chromium em commits.
- Rode `npm run check && npm test` e `python -m unittest discover -s runtime/tests -v` antes de propor alterações.
- Mudanças em `runtime/core.py`, `runtime/server.py`, `src/policies.js` ou aprovação exigem novos testes negativos e revisão explícita das permissões.
- Qualquer ação no navegador deve registrar o resultado e distinguir ação executada de objetivo comprovado.
- Timeout de envio, compra ou exclusão é **resultado incerto**, não motivo para reexecutar automaticamente.
- Mantenha a versão Standard sem a permissão `debugger`; utilize a versão Advanced somente para acesso CDP autorizado.

## Critério de qualidade

A suíte de testes atual não garante comportamento em sites reais. Antes de publicar uma versão estável, execute testes end-to-end em Chrome desktop e navegação autenticada em contas **de teste**, com autorização explícita, avaliadores independentes e medições de tempo, custo e taxa de conclusão.
