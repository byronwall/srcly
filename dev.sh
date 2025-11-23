#!/bin/sh
pnpm dlx concurrently -k -n "server,client" -c "blue,green" \
  "cd server && uv run uvicorn app.main:app --reload --port 8000" \
  "cd client && pnpm dev"
