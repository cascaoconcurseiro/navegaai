# Segurança e limites do NavegaAI

NavegaAI controla páginas web e pode operar sessões autenticadas. Teste inicialmente em contas e páginas de laboratório.

- **Dados locais:** não envie os diretórios de perfil do Chromium, tokens de acesso, SQLite nem arquivos `.env` ao GitHub. `.gitignore` reduz acidentes, mas não substitui revisão do diff.
- **Serviço local:** o runtime utiliza autenticação por token e escuta no loopback. Não o exponha à internet por encaminhamento de portas.
- **Escopo de ação:** somente destinos aprovados, com confirmação de ações sensíveis. Uma página não pode conceder permissões ao agente por meio de seu conteúdo.
- **Acesso CDP:** a edição Advanced pode inspecionar dados sensíveis. A permissão do Chrome e o consentimento dentro da extensão são controles diferentes.
- **Confiabilidade:** uma resposta de ferramenta aceita não comprova a conclusão de tarefas externas. Para operações com efeitos permanentes, o agente deve registrar incerteza e interromper novas tentativas automáticas.
- **Contato:** relate vulnerabilidades de forma privada ao mantenedor do repositório; não publique tokens ou dados pessoais em issues.

Este repositório ainda não passou por auditoria de segurança independente nem por teste end-to-end de produção. Não existe promessa de operação infalível.
