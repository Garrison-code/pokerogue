#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Garrison-code
# SPDX-License-Identifier: AGPL-3.0-only
"""HTTP-only image check; also usable against the deployed dev hostname."""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

base = sys.argv[1].rstrip("/")

def get(path, headers=None):
    try:
        with urllib.request.urlopen(urllib.request.Request(base + path, headers=headers or {}), timeout=30) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()

for attempt in range(30):
    try:
        if get('/healthz')[0] == 200:
            break
    except (OSError, urllib.error.URLError):
        pass
    time.sleep(1)
else:
    raise RuntimeError('Static server did not become ready')

status, headers, info = get('/build-info.json')
assert status == 200 and headers['Cache-Control'] == 'no-store'
build = json.loads(info)
for key, variable in [('revision', 'EXPECTED_REVISION'), ('build_id', 'EXPECTED_BUILD_ID')]:
    if os.environ.get(variable):
        assert build[key] == os.environ[variable], key
status, headers, html = get('/')
assert status == 200 and b'/@vite/client' not in html and b'/src/main.ts' not in html
assert b'runtime-config.js' in html and b'asset-manifest.json' in html
status, headers, config = get('/runtime-config.js')
assert status == 200 and headers['Cache-Control'] == 'no-store'
settings = json.loads(config.decode().split('Object.freeze(', 1)[1].rsplit(');', 1)[0])
if len(sys.argv) > 2:
    assert settings['VITE_APP_TITLE'] == sys.argv[2], settings['VITE_APP_TITLE']
assert settings['VITE_SERVER_URL'] in ('/api', base + '/api')
assert settings['VITE_BYPASS_LOGIN'] == '0'
assert settings['VITE_GOOGLE_CLIENT_ID'] == settings['VITE_DISCORD_CLIENT_ID'] == ''
status, headers, manifest = get('/asset-manifest.json')
assert status == 200 and headers['Cache-Control'] == 'no-store'
entry = json.loads(manifest)
for resource in [entry['js'], *entry['css'], *entry['preloads']]:
    path = '/' + resource.removeprefix('./')
    status, headers, body = get(path)
    assert status == 200 and len(body) > 0, path
    assert 'immutable' in headers['Cache-Control'], path
    if resource == entry['js']:
        assert b'__POKEROGUE_CONFIG__' in body, 'Runtime settings were not kept in the bundle'
status, headers, manifest = get('/manifest.json')
assert status == 200 and headers['Cache-Control'] == 'no-store'
versions = json.loads(manifest)['manifest']
resource = '/fonts/item-count.png'
version = versions[resource]
assert re.fullmatch(r'[a-f0-9]{64}', version)
status, headers, body = get(resource + '?t=' + version)
assert status == 200 and 'immutable' in headers['Cache-Control']
assert get(resource + '?t=' + version, {'If-None-Match': headers['ETag']})[0] == 304
assert get(resource)[1]['Cache-Control'] == 'no-cache'
for path in ['/src/main.ts', '/@vite/client', '/node_modules/no.js', '/missing-resource.png']:
    assert get(path)[0] == 404, path
print(json.dumps({'static_http_checks': 'passed', 'versioned_resources': len(versions), 'entry': entry['js'], 'runtime_api': settings['VITE_SERVER_URL']}))
