# One helper, two calls (T13): each call's result belongs to that call alone,
# as in value-flow-basics' two-call-identity-helper.tsx and returns-other-argument.tsx.


def ident(value: str) -> str:
    return value


def pick(a: str, b: str) -> str:
    return b


def shout_both(first: str, second: str) -> None:
    print(ident(first))
    print(ident(second))


def pick_twice(first: str, second: str) -> None:
    print(pick(first, second))
    print(pick(second, first))
