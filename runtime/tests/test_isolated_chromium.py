"""Chromium browser process integration: cookies must never cross workspaces."""
import shutil
import tempfile
import unittest
from pathlib import Path
from playwright.async_api import async_playwright
from runtime.core import Runtime

class IsolatedProfiles(unittest.IsolatedAsyncioTestCase):
    async def test_distinct_persistent_profiles_separate_cookies(self):
        executable=shutil.which('chromium')
        if not executable:self.skipTest('Chrome/Chromium not installed')
        with tempfile.TemporaryDirectory() as directory:
            playwright=await async_playwright().start()
            try:
                profile=Path(directory)/'profiles'
                async def context_factory():
                    # The runtime must call this once per workspace, not once globally.
                    index=len(created)
                    context=await playwright.chromium.launch_persistent_context(
                        str(profile/f'{index}'),executable_path=executable,headless=True,
                        args=['--no-sandbox','--disable-dev-shm-usage'])
                    created.append(context)
                    return context
                created=[]
                rt=Runtime(Path(directory)/'db.sqlite',profile,browser_factory=context_factory)
                try:
                    first=await rt.ensure_browser('one')
                    second=await rt.ensure_browser('two')
                    await first.add_cookies([{'name':'session','value':'private-one',
                        'url':'https://isolation.example/'}])
                    c1=await first.cookies('https://isolation.example/')
                    c2=await second.cookies('https://isolation.example/')
                    self.assertEqual(c1[0]['value'],'private-one')
                    self.assertFalse(any(c['name']=='session' for c in c2))
                finally:await rt.shutdown()
            finally:await playwright.stop()

if __name__=='__main__':unittest.main()
