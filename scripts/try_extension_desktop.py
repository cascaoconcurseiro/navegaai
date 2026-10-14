import asyncio, shutil, json, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    root=Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory() as profile:
        async with async_playwright() as p:
            context=await p.chromium.launch_persistent_context(profile,
                executable_path=shutil.which('chromium'),headless=False,
                args=['--no-sandbox','--disable-dev-shm-usage',f'--disable-extensions-except={root}',f'--load-extension={root}'])
            await asyncio.sleep(3)
            workers=context.service_workers
            print(json.dumps({'workers':len(workers),'urls':[w.url for w in workers]},ensure_ascii=False))
            if workers:
                import re
                m=re.search(r'chrome-extension://([a-z]{32})/',workers[0].url)
                if m:
                    page=await context.new_page()
                    await page.goto(f'chrome-extension://{m.group(1)}/src/panel.html',timeout=15000)
                    print(json.dumps({'panel_title':await page.title(),'input':await page.locator('#promptInput').count(),
                                      'console_errors':[]},ensure_ascii=False))
            await context.close()

asyncio.run(main())
