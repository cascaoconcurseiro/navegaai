"""Empacota edições Standard e Advanced, ambas com manifest.json próprio."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

project = Path(__file__).resolve().parents[1]
out = project.parent
ignore = {'__pycache__','.git','node_modules','.venv','.pytest_cache','.mypy_cache'}
manifest = json.loads((project/'manifest.json').read_text(encoding='utf-8'))
version = json.loads((project/'package.json').read_text(encoding='utf-8'))['version'].replace('-rc.', '-rc')
for name in ('Standard','Advanced-CDP'):
    dest = out/f'NavegaAI-v{version}-{name}.zip'
    m = dict(manifest)
    # Explicit per-edition permissions: never inherit an accidental debugger setting.
    m['permissions']=[p for p in manifest['permissions'] if p!='debugger']
    if name == 'Advanced-CDP':
        m['permissions'].append('debugger')
        m['description']='NavegaAI 3.3 Advanced: depuração CDP com risco elevado e consentimento.'
    else:
        m['description']='NavegaAI 3.3 Standard: runtime Playwright opcional, sem debugger.'
    with ZipFile(dest,'w',ZIP_DEFLATED,compresslevel=9) as archive:
        for f in sorted(project.rglob('*')):
            if not f.is_file() or any(x in ignore for x in f.parts):continue
            relative=f.relative_to(project)
            target=Path('NavegaAI-Extension')/relative
            if relative.as_posix()=='manifest.json':
                archive.writestr(str(target),json.dumps(m,ensure_ascii=False,indent=2)+'\n')
            else: archive.write(f,str(target))
    print(dest,dest.stat().st_size, 'bytes', 'debugger' in m['permissions'])
