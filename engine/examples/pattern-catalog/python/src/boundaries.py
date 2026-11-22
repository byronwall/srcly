# Boundaries: environment, argv, stdin, files, JSON, subprocess, network, sqlite, logging.
import argparse
import json
import logging
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import httpx
import requests

log = logging.getLogger(__name__)


# B1 os.environ read to a print
def show_home() -> None:
    home = os.environ["HOME"]  # @trace b-environ-index backward home @want environment-input
    print(home)


# B2 os.getenv default to a log
def show_mode() -> None:
    mode = os.getenv("MODE", "dev")
    log.info(mode)  # @trace b-getenv backward mode @want environment-input


# B3 sys.argv to a file write
def save_first_arg() -> None:
    target = sys.argv[1]
    Path("out.txt").write_text(target)  # @trace b-argv backward target @want process-input


# B4 argparse to a print
def cli() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name")
    args = parser.parse_args()
    print(args.name)  # @trace b-argparse backward args.name @want process-input|external-read


# B5 input() to a print
def ask() -> None:
    answer = input("name? ")
    print(answer.title())  # @trace b-input backward answer @want process-input


# B6 file read to a print
def cat(path: str) -> None:
    with open(path) as handle:
        text = handle.read()
    print(text)  # @trace b-file-read backward text @want file-input


# B7 a value written to a file
def save(note: str) -> None:  # @trace b-file-write forward symbol note @want file-write
    with open("notes.txt", "w") as handle:
        handle.write(note)


# B8 json.load to a return
def load_config(path: str) -> dict:
    with open(path) as handle:
        config = json.load(handle)
    return config["name"]  # @trace b-json-load backward config @want file-input


# B9 json.dump of a parameter
def dump_config(config: dict) -> None:  # @trace b-json-dump forward symbol config @want file-write
    with open("config.json", "w") as handle:
        json.dump(config, handle)


# B10 subprocess output to a print
def git_head() -> None:
    result = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True)
    print(result.stdout)  # @trace b-subprocess backward result @want external-read


# B11 a value handed to a subprocess
def run_tool(flag: str) -> None:  # @trace b-subprocess-arg forward symbol flag @want external-effect|external-read
    subprocess.run(["tool", flag], check=True)


# B12 requests.get response to a return
def fetch_title(url: str) -> str:
    response = requests.get(url, timeout=5)
    return response.json()["title"]  # @trace b-requests-response backward response @want fetch-input


# B13 a value sent in a request body
def post_note(note: str) -> None:  # @trace b-requests-post forward symbol note @want external-effect|fetch-input
    requests.post("https://example.com/notes", json={"note": note}, timeout=5)


# B14 httpx client response
def fetch_user(user_id: int) -> str:
    with httpx.Client() as client:
        response = client.get(f"https://example.com/users/{user_id}")
    return response.text  # @trace b-httpx backward response @want fetch-input


# B15 sqlite3 rows to a print
def list_users(db: str) -> None:
    conn = sqlite3.connect(db)
    rows = conn.execute("select name from users").fetchall()
    print(rows)  # @trace b-sqlite-read backward rows @want external-read


# B16 sqlite3 insert of a parameter
def add_user(name: str) -> None:  # @trace b-sqlite-write forward symbol name @want external-effect|external-read
    conn = sqlite3.connect("app.db")
    conn.execute("insert into users (name) values (?)", (name,))
    conn.commit()


# B17 sys.exit with a computed status
def exit_with(code: int) -> None:  # @trace b-exit forward symbol code @want exit-status
    sys.exit(code)


# B18 logging.error with a parameter
def fail(reason: str) -> None:  # @trace b-logging forward symbol reason @want external-effect
    logging.error("failed: %s", reason)
