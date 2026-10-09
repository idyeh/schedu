#!/usr/bin/env python3
"""Render every page and make contact sheets; automated checks supplement visual review."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
from PIL import Image, ImageDraw
from pypdf import PdfReader
import pdfplumber

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--expected-pages', type=int, default=24)
args = parser.parse_args()
pdf = root / 'output/pdf/schedu-user-manual.pdf'
out = root / 'tmp/pdfs/schedu-manual/review'
out.mkdir(parents=True, exist_ok=True)
renderer = shutil.which('pdftoppm')
if not renderer and Path('/opt/homebrew/bin/pdftoppm').exists():
    renderer = '/opt/homebrew/bin/pdftoppm'
if not renderer:
    raise SystemExit('Install Poppler or put pdftoppm on PATH.')
reader = PdfReader(pdf)
issues = []
if len(reader.pages) != args.expected_pages:
    issues.append(f'Expected {args.expected_pages} pages, found {len(reader.pages)}; inspect for spill pages.')
report = {'pages':len(reader.pages), 'language':reader.trailer['/Root'].get('/Lang'),
          'bookmarks':len(reader.outline), 'page_checks':[], 'issues':issues}
with pdfplumber.open(pdf) as doc:
    for n, page in enumerate(doc.pages, 1):
        text = page.extract_text() or ''
        if len(text.split()) < 40:
            issues.append(f'Page {n} has very little text; inspect for an accidental spill.')
        if '\ufffd' in text or '??' in text:
            issues.append(f'Page {n} has a replacement character or unresolved reference.')
        outside = [c['text'] for c in page.chars if c['x0'] < 0 or c['x1'] > page.width+1
                   or c['top'] < 0 or c['bottom'] > page.height+1]
        if outside:
            issues.append(f'Page {n} has text outside the page bounds: {outside[:10]}')
        report['page_checks'].append({'page':n, 'words':len(text.split()),
            'width_pt':round(page.width,2), 'height_pt':round(page.height,2),
            'images':len(page.images), 'links':len(page.annots or [])})
        (out / f'page-{n:02}.txt').write_text(text)
subprocess.run([renderer, '-r', '150', '-png', str(pdf), str(out / 'page')], check=True)
files = sorted(out.glob('page-*.png'))
for start in range(0,len(files),6):
    canvas = Image.new('RGB',(1200,1140),'#d9e1df')
    draw = ImageDraw.Draw(canvas)
    for j,p in enumerate(files[start:start+6]):
        im = Image.open(p).convert('RGB')
        im.thumbnail((380,520))
        x = (j%3)*400+(400-im.width)//2
        y = (j//3)*570+28
        canvas.paste(im,(x,y))
        draw.text((x,y-20),p.stem,fill='#202e35')
    canvas.save(out / f'contact-{start//6+1}.png')
(out / 'checks.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
if issues:
    raise SystemExit('Review the reported layout issues.')
print(f'Automated checks passed. Inspect every rendered page in {out}.')
