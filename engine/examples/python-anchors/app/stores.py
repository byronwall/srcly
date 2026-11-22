import pandas as pd
from django.db import models
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

engine = create_engine("sqlite://")


class Note(models.Model):
    text = models.TextField()


def save_note(text: str) -> None:
    Note.objects.create(text=text)


def find_notes(term: str) -> object:
    found = Note.objects.filter(text=term)
    return found


def add_row(row: object) -> None:
    with Session(engine) as session:
        session.add(row)
        session.commit()


def make() -> object:
    return object()


def rebound(row: object) -> None:
    session = Session(engine)
    session = make()
    session.add(row)


def frame_out(frame: pd.DataFrame) -> None:
    frame.to_csv("out.csv")
