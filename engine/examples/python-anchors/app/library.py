# One use of every Python library model row (`engine/models/python.json`), so a
# test can check each row resolves. Packages that are not installed here
# resolve through their imports, as on a project without its venv.
import io
import json
import logging
import os
import sqlite3
import subprocess
import sys
import tomllib
import typing
import urllib.request
from pathlib import Path

import _io
import fastapi
import fastapi.exceptions
import fastapi.responses
import flask
import flask.globals
import flask.helpers
import flask.json
import flask.templating
import httpx
import requests
import starlette.exceptions
import starlette.responses
import yaml
from httpx._client import AsyncClient, Client
from requests.sessions import Session as HttpSession
from sqlalchemy.orm.session import Session as DbSession

log = logging.getLogger(__name__)


def origins(path: Path, cursor: sqlite3.Cursor, connection: sqlite3.Connection, db: DbSession, http: HttpSession, client: Client, aclient: AsyncClient) -> list[object]:
    return [
        os.getenv("A"), os.environ.get("B"), os.environ["C"], sys.argv, sys.stdin, input(),
        open("f"), io.open("f"), path.read_text(), path.read_bytes(), path.open(),
        json.load(open("f")), tomllib.load(open("f", "rb")), yaml.safe_load("x"),
        subprocess.run(["ls"]), subprocess.check_output(["ls"]), subprocess.Popen(["ls"]),
        urllib.request.urlopen("u"), requests.get("u"), requests.post("u"), requests.request("GET", "u"), HttpSession.get(http, "u"),
        httpx.get("u"), httpx.post("u"), httpx.request("GET", "u"), Client.get(client, "u"), AsyncClient.get(aclient, "u"),
        cursor.execute("q"), cursor.fetchall(), cursor.fetchone(), connection.execute("q"),
        DbSession.execute(db, "q"), DbSession.scalars(db, "q"), DbSession.get(db, "q"), DbSession.query(db, "q"),
        flask.request.json, flask.globals.request.args,
        os._Environ.get(os.environ, "D"),
    ]


def terminals(value: str, path: Path, stream: typing.IO[str], text: typing.TextIO, wrapper: io.TextIOWrapper, raw: _io.TextIOWrapper) -> object:
    print(value)
    sys.stdout.write(value)
    log.info(value)
    logging.LoggerAdapter.info(logging.LoggerAdapter(log), value)
    logging.debug(value)
    logging.info(value)
    logging.warning(value)
    logging.error(value)
    logging.exception(value)
    logging.critical(value)
    logging.log(1, value)
    path.write_text(value)
    path.write_bytes(b"")
    json.dump(value, stream)
    stream.write(value)
    typing.TextIO.write(text, value)
    io.TextIOWrapper.write(wrapper, value)
    _io.TextIOWrapper.write(raw, value)
    flask.abort(400)
    responses = [
        fastapi.HTTPException(400), fastapi.exceptions.HTTPException(400), starlette.exceptions.HTTPException(400),
        fastapi.responses.JSONResponse(value), starlette.responses.JSONResponse(value),
        flask.json.jsonify(value), flask.jsonify(value), flask.helpers.make_response(value), flask.make_response(value),
        flask.templating.render_template(value), flask.render_template(value),
    ]
    sys.exit(value)
    return responses
