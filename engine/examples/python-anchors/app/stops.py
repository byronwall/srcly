# Where a trace stops, named: a result only a condition reads, and a def
# with nothing to trace.


def is_enabled(flag: str) -> bool:
    return flag == "on"


def configure(flag: str) -> None:
    if is_enabled(flag):
        pass


def migrate() -> None:
    pass
