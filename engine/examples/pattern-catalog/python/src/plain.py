# Plain Python: assignments, unpacking, calls, comprehensions, closures.
import functools
import logging
from typing import Iterator

log = logging.getLogger(__name__)


# P1 assignment chain to print
def greet(name: str) -> None:  # @trace p-assign-chain forward symbol name @want stdout
    first = name
    second = first.strip()
    print(second)


# P2 tuple unpacking
def split_pair(pair: tuple[str, int]) -> None:  # @trace p-tuple-unpack forward symbol pair @want stdout
    label, count = pair
    print(label, count)


# P3 dict unpacking into a call
def describe(title: str, size: int) -> str:
    return f"{title}:{size}"


def describe_all(options: dict[str, object]) -> None:  # @trace p-dict-unpack forward symbol options @want stdout
    print(describe(**options))  # type: ignore[arg-type]


# P4 *args forwarded
def total(*values: int) -> int:  # @trace p-star-args forward symbol values @want return
    return sum(values)


# P5 **kwargs read by key
def configure(**options: str) -> None:  # @trace p-kwargs forward symbol options @want external-effect
    log.info("mode %s", options["mode"])


# P6 list comprehension
def upper_all(words: list[str]) -> list[str]:  # @trace p-listcomp forward symbol words @want return
    return [word.upper() for word in words]


# P7 dict comprehension
def index_by_id(rows: list[dict[str, str]]) -> dict[str, dict[str, str]]:  # @trace p-dictcomp forward symbol rows @want return
    return {row["id"]: row for row in rows}


# P8 generator yields its input
def numbered(lines: list[str]) -> Iterator[str]:  # @trace p-generator forward symbol lines @want return|stdout
    for index, line in enumerate(lines):
        yield f"{index}: {line}"


# P9 yield from a helper generator
def all_numbered(lines: list[str]) -> Iterator[str]:  # @trace p-yield-from forward symbol lines @want return|stdout
    yield from numbered(lines)


# P10 closure over an outer variable
def make_prefixer(prefix: str):  # @trace p-closure forward symbol prefix @want return
    def apply(text: str) -> str:
        return prefix + text

    return apply


# P11 nested function called in place
def shout_twice(text: str) -> None:  # @trace p-nested-call forward symbol text @want stdout
    def twice(value: str) -> str:
        return value * 2

    print(twice(text))


# P12 functools.partial binds an argument
def send(channel: str, message: str) -> None:
    print(channel, message)


def broadcast(message: str) -> None:  # @trace p-partial forward symbol message @want stdout
    to_ops = functools.partial(send, "ops")
    to_ops(message)


# P13 lambda passed as a key
def sort_names(names: list[str]) -> list[str]:  # @trace p-lambda-key forward symbol names @want return
    return sorted(names, key=lambda item: item.lower())


# P14 callback passed as a value
def apply_each(items: list[str], fn) -> None:
    for item in items:
        fn(item)


def print_each(items: list[str]) -> None:  # @trace p-callback forward symbol items @want stdout
    apply_each(items, print)


# P15 walrus in a condition
def first_long(words: list[str]) -> None:  # @trace p-walrus forward symbol words @want stdout
    if (found := next((w for w in words if len(w) > 5), None)) is not None:
        print(found)


# P16 f-string to a log line
def report(user: str) -> None:  # @trace p-fstring-log forward symbol user @want external-effect
    log.warning(f"user {user} logged in")


# P17 exception carrying a value
def check_age(age: int) -> int:  # @trace p-exception-value forward symbol age @want return|throw|external-effect
    if age < 0:
        raise ValueError(f"bad age {age}")
    return age


# P18 match statement binds a capture
def handle(command: tuple[str, str]) -> None:  # @trace p-match forward symbol command @want stdout
    match command:
        case ("say", text):
            print(text)
        case _:
            pass
