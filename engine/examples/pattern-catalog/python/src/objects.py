# Classes, dataclasses, typed records, decorators, context managers, async, module state.
import asyncio
import functools
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Callable, Iterator, NamedTuple, TypedDict


# O1 class with __init__ fields read back in a method
class Greeter:
    def __init__(self, greeting: str) -> None:
        self.greeting = greeting

    def greet(self) -> None:
        print(self.greeting)


def make_greeter(word: str) -> None:  # @trace o-init-field forward symbol word @want stdout
    Greeter(word).greet()


# O2 property returns a field
class Account:
    def __init__(self, owner: str) -> None:
        self._owner = owner

    @property
    def owner(self) -> str:
        return self._owner


def owner_of(name: str) -> None:  # @trace o-property forward symbol name @want stdout
    account = Account(name)
    print(account.owner)


# O3 classmethod constructor
class Token:
    def __init__(self, raw: str) -> None:
        self.raw = raw

    @classmethod
    def parse(cls, text: str) -> "Token":
        return cls(text.strip())


def token_text(text: str) -> None:  # @trace o-classmethod forward symbol text @want stdout
    print(Token.parse(text).raw)


# O4 staticmethod helper
class Slug:
    @staticmethod
    def make(title: str) -> str:
        return title.lower().replace(" ", "-")


def slug_of(title: str) -> None:  # @trace o-staticmethod forward symbol title @want stdout
    print(Slug.make(title))


# O5 dataclass field
@dataclass
class Point:
    x: int
    y: int


def show_x(value: int) -> None:  # @trace o-dataclass forward symbol value @want stdout
    point = Point(x=value, y=0)
    print(point.x)


# O7 NamedTuple
class Pair(NamedTuple):
    key: str
    value: str


def pair_key(key: str) -> None:  # @trace o-namedtuple forward symbol key @want stdout
    pair = Pair(key, "v")
    print(pair.key)


# O8 TypedDict
class Movie(TypedDict):
    title: str
    year: int


def movie_title(title: str) -> None:  # @trace o-typeddict forward symbol title @want stdout
    movie: Movie = {"title": title, "year": 2000}
    print(movie["title"])


# O9 decorator that wraps and returns the call's result
def traced(fn: Callable[[str], str]) -> Callable[[str], str]:
    @functools.wraps(fn)
    def inner(text: str) -> str:
        return fn(text)

    return inner


@traced
def tidy(text: str) -> str:
    return text.strip()


def tidy_and_print(raw: str) -> None:  # @trace o-wrap-decorator forward symbol raw @want stdout
    print(tidy(raw))


# O10 decorator that registers the function
HANDLERS: dict[str, Callable[[str], None]] = {}


def register(fn: Callable[[str], None]) -> Callable[[str], None]:
    HANDLERS[fn.__name__] = fn
    return fn


@register
def on_message(body: str) -> None:  # @trace o-register-decorator forward symbol body @want stdout
    print(body)


# O11 context manager yields a value
@contextmanager
def opened(label: str) -> Iterator[str]:
    yield label.upper()


def use_opened(label: str) -> None:  # @trace o-context-manager forward symbol label @want stdout
    with opened(label) as value:
        print(value)


# O12 async/await
async def fetch_name(user_id: int) -> str:
    await asyncio.sleep(0)
    return f"user-{user_id}"


async def print_name(user_id: int) -> None:  # @trace o-await forward symbol user_id @want stdout
    name = await fetch_name(user_id)
    print(name)


# O13 asyncio.gather
async def print_all(ids: list[int]) -> None:  # @trace o-gather forward symbol ids @want stdout
    names = await asyncio.gather(*(fetch_name(i) for i in ids))
    print(names)


# O14 module state written then read back
CURRENT: dict[str, str] = {}


def remember(theme: str) -> None:  # @trace o-module-state forward symbol theme @want stdout|external-effect
    CURRENT["theme"] = theme


def show_theme() -> None:
    print(CURRENT["theme"])


# O15 global statement
COUNTER_NAME = "none"


def rename_counter(name: str) -> None:  # @trace o-global forward symbol name @want stdout
    global COUNTER_NAME
    COUNTER_NAME = name


def print_counter() -> None:
    print(COUNTER_NAME)


# O16 nonlocal
def make_counter(start: int):  # @trace o-nonlocal forward symbol start @want return
    count = start

    def bump() -> int:
        nonlocal count
        count += 1
        return count

    return bump

