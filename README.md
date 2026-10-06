# To-Do List (Django)

A small Django task manager: a per-user task list with detail, create, edit and delete views, a
`ModelForm`, and server-rendered templates on SQLite. Built during a full-stack internship in 2024.

**Live demo:** https://mustafaobaidd1.github.io/todo-list/ — the real project, running in your
browser (see [How the browser demo works](#how-the-browser-demo-works)).

## Features

- Task model with title, description, done flag and owner (`django.contrib.auth` user).
- List view showing only the signed-in user's tasks; detail, create, edit and delete views.
- One `TaskForm` (`ModelForm`) reused for creating and editing.
- Static CSS and a small script that toggles a task's done style in the list.

## Tech stack

Python, Django 5, SQLite, HTML templates, CSS, a little JavaScript.

## Run it locally

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install "django>=5.0,<6"
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Sign in at http://127.0.0.1:8000/admin/ (the project has no separate login page), then open
http://127.0.0.1:8000/tasks/.

## Project structure

```
manage.py
todo_list_project/   settings, root URLs, WSGI/ASGI entry points
tasks/               the app: model, form, views, URLs, templates, static files
demo/                the in-browser demo page (not part of the Django app)
```

## How the browser demo works

GitHub Pages can only serve static files, so it cannot run Django. The demo page in `demo/` loads
[Pyodide](https://pyodide.org/) (CPython compiled to WebAssembly) from a CDN, installs Django 5.2
from PyPI with `micropip`, unpacks this repository's Django code into Pyodide's virtual file system
and runs `migrate`. Each click or form submission inside the frame is passed to Django's test
client, and the HTML response is rendered back into the frame. The SQLite database lives in
IndexedDB, so tasks survive a reload; "Reset demo data" deletes it. A new database starts with
three example tasks so the first screen is not empty.

Differences from a real deployment, stated plainly:

- You are signed in automatically as a `demo` user, because the project signs users in through the
  Django admin, which the demo does not expose.
- The first visit downloads about 15 MB (Python and Django); later visits use the browser cache.
- Requests run in the page's main thread, one at a time.

The workflow in `.github/workflows/demo.yml` copies `demo/`, the static files and a zip of the
Django project into the GitHub Pages artifact. The Django code itself is not modified.
