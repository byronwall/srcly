from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def _client() -> TestClient:
    return TestClient(app)


def test_get_file_content_text(tmp_path: Path) -> None:
    txt = tmp_path / "note.txt"
    txt.write_text("hello world\n", encoding="utf-8")

    client = _client()
    resp = client.get(f"/api/files/content?path={txt}")

    assert resp.status_code == 200
    # FastAPI should treat this as plain text.
    assert resp.text == "hello world\n"
    assert resp.headers["content-type"].startswith("text/plain")


def test_get_file_content_binary_image(tmp_path: Path) -> None:
    png = tmp_path / "test.png"
    # Minimal PNG-like header bytes; content does not need to be a valid image
    # for the purposes of this test, only that it is served as binary.
    data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    png.write_bytes(data)

    client = _client()
    resp = client.get(f"/api/files/content?path={png}")

    assert resp.status_code == 200
    assert resp.content == data
    assert resp.headers["content-type"].startswith("image/png")


def test_get_file_content_not_found(tmp_path: Path) -> None:
    missing = tmp_path / "missing.txt"

    client = _client()
    resp = client.get(f"/api/files/content?path={missing}")

    assert resp.status_code == 404
    assert resp.json()["detail"] == "File not found"




