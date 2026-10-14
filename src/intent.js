// Only a conservative completion guard. NOT a substitute for a task planner.
// A question mark does not mean an action request was informational:
// "Você pode abrir o Gmail?" still asks the agent to navigate.
const ACTION = /\b(?:abra|abrir|acesse|acessar|navegue|navegar|clique|clicar|preencha|preencher|envie|enviar|mande|mandar|salve|salvar|baixe|baixar|publique|publicar|exclua|excluir|edite|editar|escreva|escrever|pesquise|pesquisar|faça|fazer|crie|criar|selecione|selecionar)\b/i;
const EXPLANATION = /^(?:o que|por que|porque|como funciona|explique|resuma|analise|qual a diferença|me explique)\b/i;
const QUESTION_ABOUT = /^(?:como (?:faço|posso|devo) (?:para |pra )?|onde (?:fica|encontro)|qual (?:botão|é a forma)).*(?:clicar|abrir|enviar|editar)/i;
const NEGATION = /^(?:não|nao)\s+(?:abra|acesse|clique|envie|mande|publique|salve|exclua|preencha)\b/i;
export function requestsBrowserAction(text=''){
 const value=String(text).trim();
 return ACTION.test(value)&&!EXPLANATION.test(value)&&!QUESTION_ABOUT.test(value)&&!NEGATION.test(value);
}
