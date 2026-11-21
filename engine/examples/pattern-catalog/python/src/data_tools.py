# SQLAlchemy and SQLModel sessions, Celery hand-offs, click/typer commands, pandas files.
import click
import pandas as pd
import typer
from celery import Celery
from sqlalchemy import create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlmodel import Field, SQLModel
from sqlmodel import Session as ModelSession

engine = create_engine("sqlite://")
celery = Celery("jobs")
cli_app = typer.Typer()


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]


class Hero(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str


# D1 SQLAlchemy Session(engine).add of a new row
def add_user(name: str) -> None:  # @trace d-sa-add forward symbol name @want external-effect
    with Session(engine) as session:
        session.add(User(name=name))
        session.commit()


# D2 SQLAlchemy session.get to a print
def show_user(user_id: int) -> None:
    with Session(engine) as session:
        user = session.get(User, user_id)
        print(user)  # @trace d-sa-get backward user @want external-read


# D3 SQLAlchemy select + execute
def find_users(name: str) -> list:
    with Session(engine) as session:
        rows = session.execute(select(User).where(User.name == name)).scalars().all()
    return list(rows)  # @trace d-sa-select backward rows @want external-read


# D4 SQLModel Session.add
def add_hero(name: str) -> None:  # @trace d-sqlmodel-add forward symbol name @want external-effect
    with ModelSession(engine) as session:
        session.add(Hero(name=name))
        session.commit()


# D5 SQLModel select + exec
def heroes() -> None:
    with ModelSession(engine) as session:
        found = session.get(Hero, 1)
    print(found)  # @trace d-sqlmodel-get backward found @want external-read


# D6 Celery .delay() hands the value to the task parameter
@celery.task
def send_email(address: str) -> None:
    print(address)


def signup(address: str) -> None:  # @trace d-celery-delay forward symbol address @want stdout
    send_email.delay(address)


# D7 click command option
@click.command()
@click.option("--name")
def hello(name: str) -> None:
    click.echo(name)  # @trace d-click-option backward name @want process-input|parameter


# D8 typer command argument
@cli_app.command()
def goodbye(name: str) -> None:  # @trace d-typer-arg forward symbol name @want stdout
    print(f"bye {name}")


# D9 pandas read_csv to to_csv
def clean_csv(src: str, dst: str) -> None:
    frame = pd.read_csv(src)
    frame = frame.dropna()
    frame.to_csv(dst)  # @trace d-pandas-read backward frame @want file-input


# D10 pandas to_csv of a parameter frame
def save_frame(frame: pd.DataFrame) -> None:  # @trace d-pandas-write forward symbol frame @want file-write
    frame.to_csv("out.csv")
