# A settings model reads each field from the environment; a plain model with
# the same field names does not.
from pydantic import BaseModel
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str
    DEBUG: bool = False


class Plain(BaseModel):
    SECRET_KEY: str


settings = Settings()


def secret() -> str:
    return settings.SECRET_KEY


def plain(p: Plain) -> str:
    return p.SECRET_KEY
