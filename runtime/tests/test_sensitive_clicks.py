import tempfile
import unittest
from pathlib import Path
from runtime.core import Runtime

class Locator:
    def __init__(self):self.clicked=False
    async def count(self):return 1
    async def get_attribute(self,key):return None
    async def click(self,timeout):self.clicked=True

class Page:
    url='https://mail.google.com/'
    def __init__(self):self.locator=Locator()
    def get_by_role(self,role,name,exact):return self.locator

class SensitiveClicks(unittest.IsolatedAsyncioTestCase):
    async def test_manual_authorized_send_but_not_auto_send(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime=Runtime(Path(directory)/'d.sqlite',Path(directory)/'profile')
            runtime._observe=lambda page: observe(page) # fake page, no network
            page=Page()
            args={'role':'button','name':'Enviar'}
            with self.assertRaises(PermissionError):
                await runtime._action(page,'click',args,'auto',{'https://mail.google.com'},False,None)
            self.assertFalse(page.locator.clicked)
            response,mutated=await runtime._action(page,'click',args,'approved_once',{'https://mail.google.com'},False,None)
            self.assertTrue(mutated)
            self.assertTrue(page.locator.clicked)
            await runtime.shutdown()

    async def test_payment_requires_separate_opt_in_even_after_manual_approval(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime=Runtime(Path(directory)/'d.sqlite',Path(directory)/'profile')
            runtime._observe=lambda page: observe(page)
            page=Page()
            with self.assertRaises(PermissionError):
                await runtime._action(page,'click',{'role':'button','name':'Finalizar pedido'},
                    'approved_once',{'https://mail.google.com'},False,None)
            self.assertFalse(page.locator.clicked)
            await runtime.shutdown()

async def observe(page):return {'url':page.url,'snapshot':'- button Enviar'}
