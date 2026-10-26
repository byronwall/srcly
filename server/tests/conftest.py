import os

import pytest

from app.services import activity, cache


@pytest.fixture(autouse=True)
def no_inherited_git_env(monkeypatch):
    """Drop GIT_DIR and friends that a git hook exports.

    Under a pre-push hook, a test's `git init --bare <tmp>` would otherwise
    reinitialise the real repository as bare, and its commits would land there.
    """
    for name in [n for n in os.environ if n.startswith("GIT_")]:
        monkeypatch.delenv(name)


@pytest.fixture(autouse=True)
def isolated_analysis_cache(tmp_path_factory, monkeypatch):
    """Keep every test's analysis cache out of the real user cache dir."""
    monkeypatch.setenv(cache.CACHE_DIR_ENV, str(tmp_path_factory.mktemp("srcly-cache")))
    cache.analysis_cache.clear_memory()
    activity.activity_cache.clear_memory()
    yield
    cache.analysis_cache.clear_memory()
    activity.activity_cache.clear_memory()
