#!/usr/bin/env python3
"""Run one reproducible screenshot phase through the Playwright CLI.

Start the isolated fixture server first. No production URL is accepted.
PLAYWRIGHT_CLI may point to the wrapper or a locally installed playwright-cli.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('phase', choices=['open', 'student', 'first-login', 'instructor', 'admin', 'schedule', 'records', 'records-qa', 'close'])
args = parser.parse_args()
cli = os.environ.get('PLAYWRIGHT_CLI', str(Path.home() / '.codex/skills/playwright/scripts/playwright_cli.sh'))
out = root / 'output/playwright/manual'
out.mkdir(parents=True, exist_ok=True)
env = dict(os.environ)
env.setdefault('npm_config_cache', '/private/tmp/schedu-manual-npm-cache')
env.setdefault('npm_config_registry', 'https://registry.npmjs.org')
env.setdefault('npm_config_loglevel', 'error')
cmd = [cli, '-s=schedu-manual']
if args.phase == 'open':
    cmd += ['open', 'http://127.0.0.1:3004', '--config=' + str(Path(__file__).with_name('playwright-cli.json'))]
elif args.phase == 'close':
    cmd += ['close']
else:
    script = Path(__file__).with_name('capture.mjs').read_text()
    script = script.replace('__ROOT__', json.dumps(str(root))).replace('__PHASE__', json.dumps(args.phase))
    cmd += ['run-code', script]
result = subprocess.run(cmd, cwd=out, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
(out / (args.phase + '.log')).write_text(result.stdout)
if result.returncode or '### Error' in result.stdout:
    print(result.stdout[-4500:])
    raise SystemExit(result.returncode or 1)
print(f'{args.phase}: captured successfully. Log: {out / (args.phase + ".log")}')
