import pytest

from app.services import activity, cache


@pytest.fixture(autouse=True)
def isolated_analysis_cache(tmp_path_factory, monkeypatch):
    """Keep every test's analysis cache out of the real user cache dir."""
    monkeypatch.setenv(cache.CACHE_DIR_ENV, str(tmp_path_factory.mktemp("srcly-cache")))
    cache.analysis_cache.clear_memory()
    activity.activity_cache.clear_memory()
    yield
    cache.analysis_cache.clear_memory()
    activity.activity_cache.clear_memory()
