"""Real Chromium DOM safety regression. No external network or account used."""
import shutil
import unittest
from playwright.async_api import async_playwright
from runtime.action_policy import inspect_click


class BrowserPolicy(unittest.IsolatedAsyncioTestCase):
    async def test_neutral_label_cannot_hide_form_transfer(self):
        async with async_playwright() as p:
            options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
            executable=shutil.which('chromium')
            if executable:options['executable_path']=executable
            browser=await p.chromium.launch(**options)
            try:
                page=await browser.new_page()
                await page.set_content('''<form action="/transfer-funds" method="post" onsubmit="event.preventDefault()">
                  <input name="note" value="sensitive-test-only">
                  <button type="submit">OK</button></form>
                  <button type="button">Abrir menu</button>''')
                _, risk=await inspect_click(page,'button','OK')
                _, routine=await inspect_click(page,'button','Abrir menu')
                self.assertTrue(risk.needs_approval)
                self.assertTrue(risk.financial)
                self.assertFalse(routine.needs_approval)
                await page.locator('form').evaluate("f=>f.setAttribute('action','/draft')")
                _, changed=await inspect_click(page,'button','OK')
                self.assertNotEqual(risk.fingerprint,changed.fingerprint)
                self.assertNotIn('sensitive-test-only',risk.fingerprint)
            finally:
                await browser.close()


if __name__=='__main__':
    unittest.main()
