# Fields declared by assigning a field instance in the class body (Django,
# SQLAlchemy): `Article(title=…)` and `Article.objects.create(body=…)` set
# them, `article.title` reads them. No Django types are installed here, so the
# class-level declarations are all there is.
from django.db import models


class Article(models.Model):
    title = models.CharField(max_length=200)
    body = models.TextField()
    status = "draft"

    class Meta:
        ordering = ("title",)


class Draft(models.Model):
    title = models.CharField(max_length=200)

    def __init__(self, heading: str) -> None:
        self.heading = heading


def publish(title: str) -> Article:
    return Article(title=title, unknown=1)


def store(body: str) -> None:
    Article.objects.create(body=body)


def headline(article: Article) -> str:
    return article.title


def draft(heading: str) -> Draft:
    return Draft(heading=heading)
