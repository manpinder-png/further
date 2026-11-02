#!/usr/bin/env python3
"""Run HTTP suites on separate local fixtures; never use the shared AWS store."""
import argparse
import json
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent

def ready(url):
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return json.load(response)
    except Exception:
        return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=3003)
    args = parser.parse_args()
    os.chdir(ROOT)
    node = shutil.which('node')
    if not node:
        sys.exit('Install Node 24 and run npm ci first.')
    if not (ROOT / '.next/BUILD_ID').exists():
        sys.exit('Run npm run build first, while the app server is stopped.')
    with socket.socket() as probe:
        try:
            probe.bind(('127.0.0.1', args.port))
        except OSError:
            sys.exit('Test port is busy; choose --port or stop its existing server yourself.')
    parent = ROOT / '.local/http-tests'
    parent.mkdir(parents=True, exist_ok=True)
    run = pathlib.Path(tempfile.mkdtemp(prefix='run-', dir=parent))
    env = os.environ.copy()
    env['PATH'] = str(pathlib.Path(node).parent) + os.pathsep + env.get('PATH', '')
    encoder = None
    reports = []
    try:
        if (ready('http://127.0.0.1:8767/health') or {}).get('status') != 'ready':
            python = ROOT / '.local/embedding-venv/bin/python'
            if not python.exists() or not (ROOT / '.local/models/roberta-base/model.safetensors').exists():
                sys.exit('Set up and download the local encoder first; see docs/ONBOARDING.md.')
            with (run / 'encoder.log').open('w') as log:
                encoder = subprocess.Popen([str(python), 'domains/retrieval/embedding_service.py', '--port', '8767'], env=env, stdout=log, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + 120
            while (ready('http://127.0.0.1:8767/health') or {}).get('status') != 'ready':
                if encoder.poll() is not None or time.monotonic() > deadline:
                    sys.exit('Encoder did not become ready. Inspect ' + str(run / 'encoder.log'))
                time.sleep(.2)
        for suite in ['backend-http', 'geomind-http', 'knowledge-overview-http']:
            folder = run / suite
            folder.mkdir()
            isolated = {**env, 'FURTHER_DATA_DIR': str(folder / 'db'), 'FURTHER_LOCAL_DIR': str(folder),
                        'FURTHER_ENABLE_LOCAL_PROFILES': '1', 'FURTHER_TEST_URL': 'http://127.0.0.1:' + str(args.port)}
            with (folder / 'server.log').open('w') as log:
                server = subprocess.Popen([sys.executable, 'scripts/dev.py', '--local', '--fixture', '--production', '--port', str(args.port), '--no-embeddings'], env=isolated, stdout=log, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 30
                while True:
                    health = ready(isolated['FURTHER_TEST_URL'] + '/api/health')
                    if health and health.get('modelMode') == 'fixture' and health.get('dataBackend') == 'pglite':
                        break
                    if server.poll() is not None or time.monotonic() > deadline:
                        sys.exit('Fixture server did not start. Inspect ' + str(folder / 'server.log'))
                    time.sleep(.1)
                with (folder / 'tests.log').open('w') as log:
                    result = subprocess.run([node, '--conditions=react-server', '--import', 'tsx', '--test', 'tests/' + suite + '.test.ts'], env=isolated, stdout=log, stderr=subprocess.STDOUT)
                reports.append({'suite': suite, 'exitCode': result.returncode, 'log': str(folder / 'tests.log')})
                print(suite + ': ' + ('PASS' if result.returncode == 0 else 'FAIL'), flush=True)
            finally:
                server.terminate()
                try:
                    server.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()
        (run / 'report.json').write_text(json.dumps(reports, indent=2))
        print('Evidence: ' + str(run))
        return 0 if all(report['exitCode'] == 0 for report in reports) else 1
    finally:
        if encoder is not None:
            encoder.terminate()
            try:
                encoder.wait(timeout=10)
            except subprocess.TimeoutExpired:
                encoder.kill()

if __name__ == '__main__':
    raise SystemExit(main())
