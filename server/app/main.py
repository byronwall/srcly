from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
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

# Serve SPA
# Check if client dist exists to avoid errors in dev environments without build
client_dist = "../client/dist"
if os.path.exists(client_dist):
    app.mount("/", StaticFiles(directory=client_dist, html=True), name="static")

@app.get("/api-status")
async def root():
    return {"message": "Code Steward Server is running. Visit /docs for API documentation."}
