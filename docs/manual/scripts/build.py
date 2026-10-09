#!/usr/bin/env python3
"""Compile the illustrated manual twice, leaving compiler files outside the source tree."""
import os
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[3]
source = root / 'docs/manual'
build = root / 'tmp/pdfs/schedu-manual'
output = root / 'output/pdf'
build.mkdir(parents=True, exist_ok=True)
output.mkdir(parents=True, exist_ok=True)
engine = os.environ.get('XELATEX') or shutil.which('xelatex')
if not engine and Path('/Library/TeX/texbin/xelatex').exists():
    engine = '/Library/TeX/texbin/xelatex'
if not engine:
    raise SystemExit('XeLaTeX is required (TeX Live or MacTeX). Set XELATEX if it is not on PATH.')
for run in (1, 2):
    result = subprocess.run([engine, '-interaction=nonstopmode', '-halt-on-error', '-file-line-error',
                             '-output-directory=' + str(build), 'schedu-user-manual.tex'],
                            cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (build / f'compile-{run}.txt').write_text(result.stdout)
    if result.returncode:
        print(result.stdout[-5000:])
        raise SystemExit(result.returncode)
log = (build / 'schedu-user-manual.log').read_text()
issues = [line for line in log.splitlines() if any(term in line for term in
          ['Overfull', 'Missing character:', 'undefined references', 'multiply defined'])]
if issues:
    print('\n'.join(issues))
    raise SystemExit('Layout or reference warnings remain. Inspect the build log before releasing the PDF.')
target = output / 'schedu-user-manual.pdf'
shutil.copy2(build / target.name, target)
print(f'Compiled without overflow, missing-glyph or reference warnings: {target}')
