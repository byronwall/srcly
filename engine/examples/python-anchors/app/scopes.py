# Scope bindings, callable values and destructuring: `global` and `nonlocal`
# names, module state, returned closures, local defs, `functools.partial`,
# callbacks, spreads, `match` captures, and library calls that call a function
# they are given.
import asyncio
import functools
import io
from concurrent.futures import ThreadPoolExecutor

from fastapi import BackgroundTasks, Depends, FastAPI, Header

app = FastAPI()
LABEL = "none"
STATE: dict[str, str] = {}


def show_label() -> None:
    print(LABEL)


def set_label(name: str) -> None:
    global LABEL
    LABEL = name


def remember(theme: str) -> None:
    STATE["theme"] = theme


def show_state() -> None:
    print(STATE["theme"])
    print(STATE["other"])


def make_counter(start: int):
    count = start

    def bump() -> int:
        nonlocal count
        count += 1
        return count

    return bump


def make_prefixer(prefix: str):
    def apply(text: str) -> str:
        return prefix + text

    return apply


def use_prefixer(word: str) -> str:
    return make_wrapper(word)("x")


def make_wrapper(word: str):
    def wrap(text: str) -> str:
        return word + text

    return wrap


def shout(text: str) -> None:
    def twice(value: str) -> str:
        return value * 2

    print(twice(text))


def send(channel: str, message: str) -> None:
    print(channel, message)


def broadcast(message: str) -> None:
    to_ops = functools.partial(send, "ops")
    to_ops(message)


def apply_each(items: list[str], fn) -> None:
    for item in items:
        fn(item)


def print_each(items: list[str]) -> None:
    apply_each(items, print)


def run_twice(items: list[str], fn) -> None:
    for item in items:
        fn(item)


def run_both(items: list[str]) -> None:
    run_twice(items, print)
    run_twice(items, len)


def describe(title: str, size: int = 0) -> str:
    return f"{title}:{size}"


def describe_all(options: dict[str, object]) -> None:
    print(describe(**options))  # type: ignore[arg-type]


def handle(command: tuple[str, str]) -> None:
    match command:
        case ("say", text):
            print(text)
        case _:
            pass


def save(note: str) -> None:
    with open("notes.txt", "w") as handle:
        handle.write(note)


def buffer(note: str) -> str:
    out = io.StringIO()
    out.write(note)
    return out.getvalue()


def audit(message: str) -> None:
    print(message)


async def threaded(note: str) -> None:
    await asyncio.to_thread(audit, note)


def upper(text: str) -> str:
    return text.upper()


def pooled(note: str) -> None:
    with ThreadPoolExecutor() as pool:
        future = pool.submit(upper, note)
    print(future.result())


@app.post("/audit")
def queue_audit(note: str, tasks: BackgroundTasks) -> dict:
    tasks.add_task(audit, note)
    return {"ok": True}


def bearer(authorization: str = Header()) -> str:
    return authorization.removeprefix("Bearer ")


def current_user(token: str = Depends(bearer)) -> str:
    return f"user:{token}"


@app.get("/who")
def who(user: str = Depends(current_user)) -> dict:
    return {"who": user}
