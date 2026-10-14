# NavegaAI 3.2 Professional — Release Candidate

Extensão de navegador com chat, catálogo OpenRouter, modos de aprovação, auditoria e Runtime Playwright opcional. Nesta versão o runtime mantém **perfis Chromium separados por conversa**, suporta retomada explícita com checkpoint, pede aprovação para ações sensíveis em modo Automático, diagnostica erros de página/rede e mantém um token local estável.

## Instalar

1. Extraia este ZIP numa pasta permanente.
2. Em `chrome://extensions`, habilite o modo desenvolvedor e carregue a pasta `NavegaAI-Extension`.
3. Configure OpenRouter no painel ou teste o modo demonstração.
4. Para tarefas persistentes enquanto o computador está ligado, execute `instalar-runtime-windows.bat` e `iniciar-runtime-windows.bat`.
5. Copie o token do terminal para a configuração `Runtime local · Playwright`. Cada conversa utiliza um perfil próprio e exige login separado. **Perfis anteriores à 3.2 não são importados automaticamente.**

## Verificação do código

```bash
npm run check
npm test
python -m unittest discover -s runtime/tests -v
```

## Estado de qualidade

Esta é uma **versão candidata, não certificada como estável**. Consulte [docs/RELEASE-3.2-QUALITY.md](docs/RELEASE-3.2-QUALITY.md) para o que está implementado e os testes que ainda faltam antes de recomendar uso em produção. Um agente de navegador não pode ser considerado infalível nem líder de mercado sem uma avaliação independente de tarefas reais.
