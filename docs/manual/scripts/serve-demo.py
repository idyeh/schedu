#!/usr/bin/env python3
"""Serve only the fixed manual database on loopback port 3004."""
import os
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[3]
database = root / 'tmp/pdfs/schedu-manual/demo.sqlite'
server = root / 'dist/standalone/server.js'
if not database.exists() or not server.exists():
    raise SystemExit('First run the fixture seed and npm run build:docker; see docs/manual/README.md.')
node = shutil.which('node')
if not node:
    raise SystemExit('Node 22.13 or later is required.')
env = dict(os.environ, SCHEDU_ORIGIN='http://127.0.0.1:3004',
           SCHEDU_SETUP_TOKEN='manual-fixture-only-not-for-production-2026',
           SCHEDU_DB_PATH=str(database), SCHEDU_MIGRATIONS_DIR=str(root / 'drizzle'),
           PORT='3004', HOST='127.0.0.1')
os.chdir(root)
os.execve(node, [node, '--import', str(Path(__file__).with_name('clock.mjs')), str(server)], env)
