from fastapi import APIRouter, HTTPException, Query, Response
from pathlib import Path
from fastapi.responses import PlainTextResponse
import mimetypes

from app.services.analysis import get_ipynb_analyzer

router = APIRouter(prefix="/api/files", tags=["files"])

# Plain `def` endpoints: they do blocking file I/O (and notebook parsing), so
# FastAPI runs them in a worker thread instead of on the event loop.

@router.get("/content", response_class=PlainTextResponse)
def get_file_content(
    path: str = Query(..., description="Absolute path to the file"),
    ref: str | None = Query(None, description="Git commit to read the file from instead of the disk"),
):
    """
    Get the raw content of a file, from disk or (with ``ref``) from a git commit.
    """
    file_path = Path(path)
    if ref:
        return _content_at_ref(file_path, ref)
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="Path is not a file")
        
    # Security check: In a real app, we'd want to restrict this to the project root.
    # For this local tool, we'll allow reading any file as requested, but maybe warn?
    
    try:
        # Log every file read request before processing so hangs/crashes are attributable.
        print(f"📄 Reading file content: {file_path}", flush=True)

        if file_path.suffix == ".ipynb":
            return get_ipynb_analyzer().get_virtual_content(str(file_path))
        
        # Check mime type to see if we should serve as binary
        mime_type, _ = mimetypes.guess_type(file_path)
        
        # Text types that we can comfortably read as string
        # We'll treat None as text for code files usually, or catch UnicodeDecodeError
        is_text = False
        if mime_type and (mime_type.startswith("text/") or mime_type == "application/json"):
            is_text = True
        elif mime_type is None:
            # Assume code/text if unknown (e.g. .ts, .py often return None or text/plain)
            # We'll try to read as text.
            is_text = True
            
        if is_text:
            return file_path.read_text(encoding="utf-8")
        else:
            # Binary file (image, etc.)
            return Response(content=file_path.read_bytes(), media_type=mime_type or "application/octet-stream")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")

def _content_at_ref(file_path: Path, ref: str) -> str:
    """``git show <ref>:<path>``; the file may no longer exist on disk."""
    from app.services.compare.git_refs import GitError, repo_root, run_git

    existing = file_path
    while not existing.exists() and existing != existing.parent:
        existing = existing.parent
    try:
        repo = repo_root(existing)
        rel = file_path.resolve().relative_to(repo).as_posix()
        return run_git(repo, "show", f"{ref}:{rel}")
    except (GitError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=f"File not found at {ref}: {exc}") from exc


@router.get("/suggest")
def suggest_files(path: str = Query(..., description="Path to list contents of")):
    """
    List files and directories in the given path for auto-suggestion.
    """
    try:
        # Handle empty path or root
        if not path or path == ".":
            p = Path.cwd()
        else:
            p = Path(path)
            
        if not p.exists():
            # If path doesn't exist, try parent
            p = p.parent
            
        if not p.exists() or not p.is_dir():
            return {"items": [], "current": str(p)}

        items = []
        for item in p.iterdir():
            try:
                # Skip hidden files/dirs
                if item.name.startswith('.'):
                    continue
                    
                items.append({
                    "name": item.name,
                    "path": str(item.absolute()),
                    "type": "folder" if item.is_dir() else "file"
                })
            except PermissionError:
                continue
                
        # Sort: folders first, then files
        items.sort(key=lambda x: (x["type"] != "folder", x["name"].lower()))
        
        return {
            "items": items,
            "current": str(p.absolute())
        }
        
    except Exception as e:
        print(f"Error in suggest: {e}")
        return {"items": [], "error": str(e)}
