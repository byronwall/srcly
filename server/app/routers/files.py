from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
from fastapi.responses import PlainTextResponse

router = APIRouter(prefix="/api/files", tags=["files"])

@router.get("/content", response_class=PlainTextResponse)
async def get_file_content(path: str = Query(..., description="Absolute path to the file")):
    """
    Get the raw content of a file.
    """
    file_path = Path(path)
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="Path is not a file")
        
    # Security check: In a real app, we'd want to restrict this to the project root.
    # For this local tool, we'll allow reading any file as requested, but maybe warn?
    
    try:
        return file_path.read_text(encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")

@router.get("/suggest")
async def suggest_files(path: str = Query(..., description="Path to list contents of")):
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
