// Runs the Django project from this repository inside the browser with Pyodide.
// Every navigation or form submission in the frame is handed to Django's test client,
// and the HTML it returns is rendered back into the frame.

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
const DJANGO = 'django==5.2.18';
const START_PATH = '/tasks/';

const $ = (id) => document.getElementById(id);
const frame = $('frame');
const address = $('address');
const boot = $('boot');
const errorBox = $('error');
const backBtn = $('back');
const reloadBtn = $('reload');
const resetBtn = $('reset');

let py;
let handle;
let current = START_PATH;
const history = [];
let busy = false;

function setStep(index) {
  for (const li of document.querySelectorAll('#steps li')) {
    const n = Number(li.dataset.step);
    li.dataset.state = n < index ? 'done' : n === index ? 'active' : '';
  }
}

function syncfs(populate) {
  return new Promise((resolve, reject) =>
    py.FS.syncfs(populate, (err) => (err ? reject(err) : resolve())),
  );
}

const BOOTSTRAP = `
import json, os, sys
sys.path.insert(0, '/app')
os.environ['DJANGO_SETTINGS_MODULE'] = 'todo_list_project.settings'
# Django refuses ORM calls inside a running event loop; this page is single-threaded.
os.environ['DJANGO_ALLOW_ASYNC_UNSAFE'] = 'true'

from django.conf import settings
settings.DATABASES['default']['NAME'] = '/data/db.sqlite3'
settings.ALLOWED_HOSTS = ['*']
settings.STATIC_URL = STATIC_URL

import django
django.setup()
from django.core.management import call_command
from django.contrib.auth.models import User
from django.test import Client

def prepare():
    call_command('migrate', verbosity=0)
    user, _ = User.objects.get_or_create(username='demo')
    client = Client()
    client.force_login(user)
    return client

client = prepare()

def handle(method, path, payload):
    global client
    data = json.loads(payload) if payload else {}
    response = client.post(path, data) if method == 'POST' else client.get(path)
    hops = 0
    while response.status_code in (301, 302, 303, 307, 308) and hops < 5:
        path = response['Location']
        response = client.get(path)
        hops += 1
    return json.dumps({
        'status': response.status_code,
        'path': path,
        'html': response.content.decode('utf-8', 'replace'),
    })

def reset():
    global client
    from django.db import connection
    connection.close()
    if os.path.exists('/data/db.sqlite3'):
        os.remove('/data/db.sqlite3')
    client = prepare()
`;

async function start() {
  errorBox.hidden = true;
  boot.hidden = false;
  try {
    setStep(0);
    const { loadPyodide } = await import(`${PYODIDE_URL}pyodide.mjs`);
    py = await loadPyodide({ indexURL: PYODIDE_URL });

    setStep(1);
    await py.loadPackage('micropip');
    await py.runPythonAsync(`import micropip\nawait micropip.install('${DJANGO}')`);

    setStep(2);
    const zip = await fetch('app.zip');
    if (!zip.ok) throw new Error(`Could not download the project files (HTTP ${zip.status}).`);
    py.unpackArchive(await zip.arrayBuffer(), 'zip', { extractDir: '/app' });
    py.FS.mkdirTree('/data');
    py.FS.mount(py.FS.filesystems.IDBFS, {}, '/data');
    await syncfs(true);

    setStep(3);
    py.globals.set('STATIC_URL', new URL('static/', location.href).href);
    py.runPython(BOOTSTRAP);
    handle = py.globals.get('handle');
    await syncfs(false);

    setStep(4);
    const initial = decodeURIComponent(location.hash.slice(1)) || START_PATH;
    await go('GET', initial.startsWith('/') ? initial : START_PATH, null, false);
    boot.hidden = true;
    frame.hidden = false;
    resetBtn.disabled = false;
    reloadBtn.disabled = false;
    document.documentElement.dataset.ready = 'true';
  } catch (err) {
    console.warn(err);
    boot.hidden = true;
    errorBox.hidden = false;
    $('error-text').textContent =
      err instanceof Error ? err.message : 'Something went wrong while loading Python.';
  }
}

async function go(method, path, data, push = true) {
  if (busy) return;
  busy = true;
  try {
    const result = JSON.parse(handle(method, path, data ? JSON.stringify(data) : ''));
    if (push && result.path !== current) history.push(current);
    current = result.path;
    address.textContent = current;
    backBtn.disabled = history.length === 0;
    if (history.length > 50) history.shift();
    window.history.replaceState(null, '', `#${encodeURIComponent(current)}`);
    if (method === 'POST') await syncfs(false);
    render(result.html);
  } finally {
    busy = false;
  }
}

function render(html) {
  frame.srcdoc = html;
}

frame.addEventListener('load', () => {
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.addEventListener('click', (event) => {
    const link = event.target?.closest?.('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') ?? '';
    if (href.startsWith('/')) {
      event.preventDefault();
      go('GET', href);
    } else if (/^https?:/i.test(href)) {
      event.preventDefault();
      window.open(href, '_blank', 'noopener');
    }
  });
  doc.addEventListener('submit', (event) => {
    const form = event.target;
    if (form?.tagName !== 'FORM') return;
    event.preventDefault();
    const action = form.getAttribute('action') || current;
    const method = (form.getAttribute('method') || 'get').toUpperCase();
    // FormData from the frame's own realm, so it accepts the frame's form element.
    const FormDataInFrame = frame.contentWindow?.FormData ?? FormData;
    const fields = Object.fromEntries(new FormDataInFrame(form, event.submitter ?? undefined));
    if (method === 'POST') go('POST', action, fields);
    else go('GET', `${action}?${new URLSearchParams(fields)}`);
  });
});

backBtn.addEventListener('click', () => {
  const previous = history.pop();
  if (previous) go('GET', previous, null, false);
});
reloadBtn.addEventListener('click', () => go('GET', current, null, false));
resetBtn.addEventListener('click', async () => {
  py.globals.get('reset')();
  await syncfs(false);
  history.length = 0;
  go('GET', START_PATH, null, false);
});
$('retry').addEventListener('click', () => location.reload());

start();
