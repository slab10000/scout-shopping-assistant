#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ -x .venv/bin/python ]; then
  SCOUT_PYTHON=.venv/bin/python
elif [ -x ../.venv/bin/python ]; then
  SCOUT_PYTHON=../.venv/bin/python
else
  python3 -m venv .venv
  .venv/bin/python -m pip install -r requirements.txt
  SCOUT_PYTHON=.venv/bin/python
fi
exec "$SCOUT_PYTHON" webapp.py
