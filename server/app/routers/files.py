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
