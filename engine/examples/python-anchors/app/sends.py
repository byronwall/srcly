import subprocess

import requests


def post_note(note: str) -> str:
    response = requests.post("https://example.com/notes", json={"note": note}, timeout=5)
    return response.text


def run_tool(flag: str) -> str:
    result = subprocess.run(["tool", flag], capture_output=True, text=True)
    return result.stdout
