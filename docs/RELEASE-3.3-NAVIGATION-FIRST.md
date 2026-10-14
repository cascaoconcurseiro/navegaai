# NavegaAI 3.3 RC — Navigation-First / HTTPS reliability

Status: **release candidate para testes controlados**. Não está homologada como equivalente ao Claude; não foi validada instalada no Chrome desktop real autenticado.

## Falhas concretas corrigidas

1. **Nova conversa sem homepage:** uma aba `about:blank` ou `chrome://newtab` é representada como `navigationOnly`, sem navegação automática para Google. A ferramenta `get_page` oferece ao modelo instruções claras para usar `navigate_tab` com destino web completo. Ações DOM permanecem proibidas antes do commit da página web.
2. **Confirmação de navegação:** o retorno de `chrome.tabs.update` não é mais tratado como carregamento concluído. O executor exige URL comprometida e status `complete`, distinguindo o estado antigo, `pendingUrl` e redirecionamento. Navegação não confirmada lança `NAVEGACAO_SEM_CONFIRMACAO`, sem repetir cegamente a operação.
3. **Diagnóstico de página de erro:** `chrome-error://` produz `NAVEGACAO_BLOQUEADA` sem alegação de sucesso. Falhas de DNS/política de rede não são resolvidas por esta alteração.
4. **Redirecionamentos e escopo:** a origem final de autenticação (ex.: `accounts.google.com`) passa por uma **nova autorização explícita**; caso negada, ler ou agir após o redirecionamento continua bloqueado. `about:blank` não é considerado um site autorizado.
5. **Aba inalterada:** o motor opera somente na aba da conversa e não cria guias auxiliares para contornar páginas protegidas.

## Testes

```bash
npm run check
npm test
python -m unittest discover -s runtime/tests -q
python scripts/smoke_browser.py
python scripts/build_editions.py
```

A suíte JavaScript inclui simulações de transições de estado do Chrome para navegação; os testes Python fazem execução sobre página sintética no Chromium. Não são testes de Gmail autenticado nem de comparações com Claude.

## Limites

- Não é possível injetar scripts ou controlar páginas internas `chrome://`, `chrome-extension://` e perfis administrativamente bloqueados.
- Chrome MV3 pode suspender o service worker; tarefas longas precisam do runtime separado quando aplicável.
- A navegação HTTP(S) pode falhar por rede, autenticação e políticas do navegador. O motor não pode nem deve contorná-las.
- Cliques que enviam dados não devem ser repetidos automaticamente quando o resultado é indeterminado.
- Precisa de teste de instalação real, Chrome com rede e conta de laboratório. Não há taxa comprovada de sucesso frente a agentes comerciais.

## Checklist de QA no Windows

1. Desative extensões NavegaAI antigas e carregue a pasta Standard em `chrome://extensions`.
2. Crie uma conversa nova, deixe a aba vazia e peça: “Abra https://example.com”. Confirme ausência de navegação implícita a Google e destino carregado na mesma aba.
3. Em outra conversa, peça navegação entre dois domínios permitidos; confirme aprovação conforme configuração e isolamento das abas.
4. Teste uma URL inválida e uma página Chrome protegida; confirme recusa segura, sem falsa mensagem de sucesso.
5. Simule conexão cortada durante navegação; confirme `NAVEGACAO_SEM_CONFIRMACAO`, sem retry automático.
6. Reexecute `npm test` e a suíte Python antes de promover a candidata.
