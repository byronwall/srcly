# Flask and Django: request reads to responses, ORM writes and template context; DRF serializers.
from django.db import models
from django.http import JsonResponse
from django.shortcuts import render
from flask import Flask, jsonify, request
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

flask_app = Flask(__name__)


# W1 Flask request.args to jsonify
@flask_app.get("/greet")
def greet():
    name = request.args.get("name", "")
    return jsonify(greeting=f"hi {name}")  # @trace w-flask-args backward name @want request|parameter


# W2 Flask request.json to jsonify
@flask_app.post("/echo")
def echo():
    body = request.get_json()  # @trace w-flask-json forward body @want http-response
    return jsonify(body)


class Article(models.Model):
    title = models.CharField(max_length=200)
    body = models.TextField()


# W3 Django request.GET to an ORM filter
def search_articles(request):
    term = request.GET.get("q", "")  # @trace w-django-get forward term @want external-read|http-response|external-effect
    found = Article.objects.filter(title__icontains=term)
    return render(request, "list.html", {"articles": found})


# W4 Django request.POST to Model.objects.create
def create_article(request):
    title = request.POST["title"]  # @trace w-django-create forward title @want external-effect|http-response
    Article.objects.create(title=title, body="")
    return JsonResponse({"ok": True})


# W5 Django model field set then save()
def rename_article(request, pk: int):
    article = Article.objects.get(pk=pk)
    article.title = request.POST["title"]  # @trace w-django-save forward request.POST["title"] @want external-effect
    article.save()
    return JsonResponse({"ok": True})


# W6 Django template context
def show_article(request, pk: int):  # @trace w-django-template forward symbol pk @want http-response
    article = Article.objects.get(pk=pk)
    return render(request, "detail.html", {"article": article})


class ArticleSerializer(serializers.Serializer):
    title = serializers.CharField()


# W7 DRF request.data through a serializer to a Response
@api_view(["POST"])
def create_with_serializer(request):
    serializer = ArticleSerializer(data=request.data)  # @trace w-drf-serializer forward request.data @want http-response|external-effect
    serializer.is_valid(raise_exception=True)
    return Response(serializer.validated_data)
