from typing import Set

IGNORE_DIRS: Set[str] = {
    '.git',
    'node_modules',
    'venv',
    '.venv',
    '__pycache__',
    'dist',
    'build',
    '.next',
    'coverage',
    '.idea',
    '.vscode',
    'target',
    'out',
    'android',
    'ios',
}

IGNORE_FILES: Set[str] = {
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'cargo.lock', 
    'poetry.lock', 'Gemfile.lock', 'composer.lock', 'mix.lock'
}

IGNORE_EXTENSIONS: Set[str] = {
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', 
    '.zip', '.tar', '.gz', '.map', '.min.js', '.min.css', '.json', '.xml', '.txt', '.md'
}
