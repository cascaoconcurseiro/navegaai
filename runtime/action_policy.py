"""Deterministic action review gates for browser mutations.

The model may propose a target, but it cannot declare that target safe.
Only structural metadata is inspected; form values are never logged.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_FINANCIAL = re.compile(r'(?i)\b(pay|payment|purchase|checkout|buy now|wire|transfer(?:[-_ /](?:money|funds))?|wire[-_ /]?funds|pagar|comprar|pix|finalizar (?:compra|pedido))\b')
_DESTRUCTIVE = re.compile(r'(?i)\b(delete|remove|erase|deactivate|discard|excluir|apagar|remover|desativar|descartar)\b')
_SEND = re.compile(r'(?i)\b(send|submit|publish|post|enviar|publicar|postar|confirmar)\b')
_WRITE = re.compile(r'(?i)\b(save|update|create|apply|upload|salvar|atualizar|criar|aplicar|anexar)\b')


@dataclass(frozen=True)
class ActionRisk:
    category: str
    needs_approval: bool
    financial: bool
    fingerprint: str


def classify_action(role: str, name: str, structure: dict | None = None) -> ActionRisk:
    """Classify using both accessible label and target DOM structure."""
    structure = structure if isinstance(structure, dict) else {}
    kind = str(structure.get('type') or '').lower()[:32]
    form = bool(structure.get('inForm'))
    method = str(structure.get('formMethod') or '').lower()[:10]
    href = str(structure.get('href') or '')[:500]
    form_action = str(structure.get('formAction') or '')[:500]
    joined = ' '.join([name or '', href, form_action])[:1100]
    financial = bool(_FINANCIAL.search(joined))
    if financial:
        category = 'financial'
    elif _DESTRUCTIVE.search(joined):
        category = 'destructive'
    elif _SEND.search(joined):
        category = 'communication'
    elif kind == 'submit' and form or (form and method in ('post','put','patch','delete')):
        category = 'form_submission'
    elif _WRITE.search(joined):
        category = 'data_mutation'
    else:
        category = 'routine'
    fingerprint = '\x1f'.join([role or '', name or '', kind, str(form), method, href, form_action])
    return ActionRisk(category, category != 'routine', financial, fingerprint)


async def inspect_click(page, role: str, name: str):
    """Inspect one exact browser locator before acting; fail closed on ambiguity."""
    locator = page.get_by_role(role, name=name, exact=True)
    n = await locator.count()
    if n != 1:
        raise ValueError(f'Alvo ambíguo ou ausente: {n} correspondências exatas.')
    if not hasattr(locator, 'evaluate'):
        structure = {'type':'submit'} if role == 'button' else {}
    else:
        structure = await locator.evaluate('''element => {
            const form = element.form || element.closest('form');
            return {
                type: (element.getAttribute('type') || (element.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase(),
                inForm: !!form,
                formMethod: form ? (form.getAttribute('method') || 'get').toLowerCase() : '',
                formAction: form ? (form.getAttribute('action') || '') : '',
                href: element.getAttribute('href') || ''
            };
        }''')
    return locator, classify_action(role, name, structure)
