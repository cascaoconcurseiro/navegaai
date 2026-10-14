"""Guard the action risk vocabulary, especially transfers and checkout controls."""
import unittest
from runtime.core import HIGH_RISK, FINANCIAL_RISK

class RiskContracts(unittest.TestCase):
    def test_checkout_variants_are_sensitive(self):
        for label in ('Comprar', 'Finalizar pedido', 'Buy now', 'Checkout', 'Transfer money', 'Pix'):
            with self.subTest(label=label):
                self.assertTrue(HIGH_RISK.search(label) or FINANCIAL_RISK.search(label))

    def test_benign_controls_do_not_match(self):
        for label in ('Próximo', 'Voltar', 'Pesquisar', 'Abrir filtro'):
            with self.subTest(label=label):
                self.assertFalse(HIGH_RISK.search(label) or FINANCIAL_RISK.search(label))
