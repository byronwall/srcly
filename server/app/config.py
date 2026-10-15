from typing import Set

IGNORE_DIRS: Set[str] = {
    ".git",
    "node_modules",
    "venv",
    ".venv",
    "__pycache__",
    "dist",
    "build",
    ".next",
    "coverage",
    ".idea",
    ".vscode",
    "target",
    "out",
    "android",
    "ios",
}

IGNORE_FILES: Set[str] = {
    # In git worktrees and submodules `.git` is a pointer file, not a directory.
    ".git",
    ".DS_Store",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "cargo.lock",
    "poetry.lock",
    "Gemfile.lock",
    "composer.lock",
    "mix.lock",
}

IGNORE_EXTENSIONS: Set[str] = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".map",
    ".min.js",
    ".min.css",
    ".json",
    ".xml",
    ".txt",
    ".ttf",
    ".woff",
    ".woff2",
    ".eot",
    ".otf",
    ".mp4",
    ".mp3",
    ".wav",
    ".webm",
    ".ogg",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".bin",
    ".iso",
    ".dmg",
    ".pkg",
    ".deb",
    ".rpm",
    ".csv",
    ".lock",
}

# Binary formats that are never worth analyzing. Files without a listed
# extension are still caught by a null-byte sniff (see BINARY_SNIFF_BYTES).
BINARY_EXTENSIONS: Set[str] = {
    ".wasm",
    ".o",
    ".a",
    ".lib",
    ".obj",
    ".pdb",
    ".class",
    ".jar",
    ".war",
    ".pyc",
    ".pyo",
    ".node",
    ".webp",
    ".avif",
    ".bmp",
    ".tif",
    ".tiff",
    ".psd",
    ".heic",
    ".icns",
    ".mov",
    ".avi",
    ".mkv",
    ".flac",
    ".m4a",
    ".aac",
    ".7z",
    ".bz2",
    ".xz",
    ".zst",
    ".rar",
    ".tgz",
    ".sqlite",
    ".sqlite3",
    ".db",
    ".npy",
    ".npz",
    ".pkl",
    ".parquet",
    ".onnx",
    ".pt",
    ".safetensors",
}

# How much of each candidate file to read when sniffing for binary content.
BINARY_SNIFF_BYTES = 8 * 1024

# Minified/bundled JS and CSS: checked by content, since built bundles rarely
# carry a ``.min`` suffix (e.g. Vite's ``assets/index-<hash>.js``).
MINIFIED_CHECK_EXTENSIONS: Set[str] = {".js", ".mjs", ".cjs", ".css"}
MINIFIED_SNIFF_BYTES = 64 * 1024
# Hand-written code averages well under 80 characters per line.
MINIFIED_MIN_AVG_LINE_LENGTH = 200

# Files larger than this skip their analyzer and stay in the tree with a line
# count and size only (analysis_status "too_large"). The scan checks this before
# dispatch, so no worker is spent on them. Peak worker memory grows about 80 MB
# per MB of input on the heaviest paths (tree-sitter on generated TSX, CSS,
# lizard on HTML with data URLs), so 2 MiB keeps a worker near 220 MB. The
# largest real source files in the repos measured are under 1 MB.
MAX_ANALYZED_FILE_BYTES = 2 * 1024 * 1024
