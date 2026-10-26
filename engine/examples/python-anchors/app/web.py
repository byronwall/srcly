# A Flask app: `request.json` and `request.args` are where a request enters,
# and a handler's return (or `jsonify(...)`) is where its response leaves.
import functools

import click
from flask import Flask, jsonify, request

app = Flask(__name__)


@app.post("/echo")
def echo():
    payload = request.json
    return jsonify(payload)


@app.get("/greet")
def greet():
    return request.args.get("name", "")


def not_a_handler(request: str) -> str:
    return request


@click.command()
@click.option("--name")
def hello(name: str) -> None:
    print(name)


@functools.cache
def cached(value: str) -> str:
    return value
