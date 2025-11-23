# Srcly Server

A FastAPI server for static code analysis using [lizard](https://github.com/terryyin/lizard).

## Features

- **Static Analysis**: Scans the codebase for cyclomatic complexity and LOC (Lines of Code).
- **Caching**: Caches analysis results to `codebase_mri.json` to avoid redundant scans.
- **File Serving**: Provides an API to read raw file contents (absolute paths).
- **API Documentation**: Auto-generated Swagger UI at `/docs`.

## Setup

This project is managed with `uv`.

1. **Install dependencies**:

   ```bash
   uv sync
   ```

## Running the Server

Start the server with hot-reloading:

```bash
uv run uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.

## API Endpoints

### Analysis

- `GET /api/analysis`: Get the analysis tree. Scans if no cache exists.
- `POST /api/analysis/refresh`: Force a new scan.

### Files

- `GET /api/files/content?path=/absolute/path/to/file`: Get raw file content.

## Client Generation

You can generate a client SDK (TypeScript, Python, etc.) using the OpenAPI schema available at `http://localhost:8000/openapi.json`.

Example using `openapi-generator-cli`:

```bash
npx @openapitools/openapi-generator-cli generate -i http://localhost:8000/openapi.json -g typescript-axios -o ../client/src/api
```
