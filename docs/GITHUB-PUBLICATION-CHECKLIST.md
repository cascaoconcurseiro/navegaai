# Publicação do NavegaAI no GitHub

## Status

Versão base: 3.2.0 RC, extraída do pacote Standard previamente produzido. Código preparado e validado localmente, **ainda não enviado ao GitHub**.

## Repositório de destino

O endereço informado `cascaoconcurseiro/navegaai` não foi encontrado pela conexão. O repositório acessível e vazio encontrado é `cascaoconcurseiro/navegaai-` (hífen final). **Não publicar até o proprietário confirmar o destino correto.**

## Testes e ações executadas

- `npm run check`
- `npm test`
- `python -m unittest discover -s runtime/tests -v`
- `python scripts/build_editions.py`
- Verificação dos manifestos: Standard sem `debugger`, Advanced com `debugger`.

## Itens ainda pendentes para produção

- Teste end-to-end com extensão instalada no Chrome desktop.
- Testes autorizados de tarefas autenticadas em contas de laboratório.
- Benchmark de conclusão de tarefas com verificação externa.
- Auditoria de segurança independente e validação de política de privacidade.

## Após a confirmação do destino

1. Inicializar o repositório vazio com os arquivos validados e um commit único na `main`, mantendo a versão RC.
2. Proteger a `main` e usar branches de trabalho e pull requests para alterações subsequentes.
3. Revisar os jobs de CI e só então liberar uma tag estável.

**Nunca subir tokens, perfis Chromium ou bancos SQLite.**
