# Functions handed to code outside the program are called by it: FastAPI calls
# a `Depends(...)` target, named in an `Annotated` alias or a default, and
# passes what it returns or yields to the handler's parameter. A helper
# nothing calls or registers stays a gap.
from typing import Annotated

from fastapi import APIRouter, Depends

router = APIRouter()


def get_token(authorization: str) -> str:
    return authorization


Token = Annotated[str, Depends(get_token)]


def get_user(token: Token) -> str:
    return token.upper()


def get_session(token: Token):
    yield token


SessionDep = Annotated[str, Depends(get_session)]


@router.get("/me")
def me(session: SessionDep, user: str = Depends(get_user)) -> str:
    return session + user


def helper(text: str) -> str:
    return text
