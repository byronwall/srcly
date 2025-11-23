from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import analysis, files

app = FastAPI(
    title="Code Steward Server",
    description="API for static code analysis and file serving.",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(analysis.router)
app.include_router(files.router)

@app.get("/")
async def root():
    return {"message": "Code Steward Server is running. Visit /docs for API documentation."}
