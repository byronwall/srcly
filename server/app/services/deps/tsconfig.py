"""tsconfig discovery and `paths` / `baseUrl` resolution shared by dependency analysis."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional


def strip_json_comments(text: str) -> str:
    """Remove `//` and `/* */` comments from JSONC, leaving strings intact."""
    out: list[str] = []
    i = 0
    n = len(text)
    in_string = False
    quote = ""
    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if in_string:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == quote:
                in_string = False
            i += 1
            continue
        if ch in ('"', "'"):
            in_string = True
            quote = ch
            out.append(ch)
            i += 1
            continue
        if ch == "/" and nxt == "/":
            end = text.find("\n", i)
            i = n if end == -1 else end
            continue
        if ch == "/" and nxt == "*":
            end = text.find("*/", i + 2)
            i = n if end == -1 else end + 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


_TRAILING_COMMA = re.compile(r",(\s*[}\]])")


def parse_jsonc(text: str) -> dict:
    cleaned = _TRAILING_COMMA.sub(r"\1", strip_json_comments(text))
    data = json.loads(cleaned)
    return data if isinstance(data, dict) else {}


def _read_jsonc(path: Path) -> dict:
    try:
        return parse_jsonc(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


@dataclass
class TsConfig:
    path: Path
    base_url: Optional[Path] = None
    # Directory `paths` targets are relative to (baseUrl, or the config that declares `paths`).
    paths_base: Optional[Path] = None
    paths: Dict[str, List[str]] = field(default_factory=dict)

    def candidates(self, spec: str) -> List[Path]:
        """Filesystem candidates for a bare specifier via `paths`, then `baseUrl`."""
        out: List[Path] = []
        base = self.paths_base or self.path.parent
        best: Optional[tuple[int, List[str], str]] = None
        for pattern, targets in self.paths.items():
            if "*" in pattern:
                prefix, _, suffix = pattern.partition("*")
                if spec.startswith(prefix) and spec.endswith(suffix) and len(spec) >= len(prefix) + len(suffix):
                    wildcard = spec[len(prefix) : len(spec) - len(suffix)]
                    # TypeScript picks the pattern with the longest prefix.
                    if best is None or len(prefix) > best[0]:
                        best = (len(prefix), targets, wildcard)
            elif pattern == spec:
                out.extend(base / t for t in targets)
        if best is not None:
            _, targets, wildcard = best
            out.extend(base / t.replace("*", wildcard, 1) for t in targets)
        if self.base_url is not None:
            out.append(self.base_url / spec)
        return out


def load_tsconfig(path: Path, _seen: Optional[set[Path]] = None) -> TsConfig:
    """Load a tsconfig, following relative `extends` chains."""
    seen = _seen or set()
    path = path.resolve()
    cfg = TsConfig(path=path)
    if path in seen:
        return cfg
    seen.add(path)
    data = _read_jsonc(path)

    extends = data.get("extends")
    parents = extends if isinstance(extends, list) else [extends] if isinstance(extends, str) else []
    for ext in parents:
        if not isinstance(ext, str) or not ext.startswith("."):
            continue  # package-based extends are not resolved
        ext_path = (path.parent / ext).resolve()
        if ext_path.suffix != ".json":
            ext_path = ext_path.with_name(ext_path.name + ".json") if not ext_path.exists() else ext_path
        if ext_path.is_file():
            parent = load_tsconfig(ext_path, seen)
            cfg.base_url = parent.base_url or cfg.base_url
            cfg.paths_base = parent.paths_base or cfg.paths_base
            cfg.paths.update(parent.paths)

    compiler = data.get("compilerOptions") or {}
    base_url = compiler.get("baseUrl")
    if isinstance(base_url, str) and base_url.strip():
        cfg.base_url = (path.parent / base_url).resolve()
    raw_paths = compiler.get("paths")
    if isinstance(raw_paths, dict):
        cfg.paths = {}
        for key, value in raw_paths.items():
            if isinstance(value, list):
                cfg.paths[key] = [v for v in value if isinstance(v, str)]
            elif isinstance(value, str):
                cfg.paths[key] = [value]
        cfg.paths_base = cfg.base_url or path.parent
    elif cfg.base_url is not None and cfg.paths and cfg.paths_base is None:
        cfg.paths_base = cfg.base_url
    return cfg


class TsConfigResolver:
    """Finds the tsconfig set governing a directory (nearest dir with tsconfig*.json)."""

    def __init__(self, stop_at: Optional[Path] = None):
        self._by_dir: Dict[Path, List[TsConfig]] = {}
        self._stop_at = stop_at.resolve() if stop_at else None

    def _configs_in(self, directory: Path) -> List[TsConfig]:
        files = sorted(directory.glob("tsconfig*.json"))
        configs: List[TsConfig] = []
        seen: set[Path] = set()
        for f in files:
            cfg = load_tsconfig(f)
            configs.append(cfg)
            seen.add(cfg.path)
            # Solution-style configs list the real ones under "references".
            for ref in _read_jsonc(f).get("references") or []:
                ref_path = ref.get("path") if isinstance(ref, dict) else None
                if not isinstance(ref_path, str):
                    continue
                target = (directory / ref_path).resolve()
                if target.is_dir():
                    target = target / "tsconfig.json"
                if target.is_file() and target not in seen:
                    seen.add(target)
                    configs.append(load_tsconfig(target))
        # Configs that actually declare paths/baseUrl go first.
        configs.sort(key=lambda c: (not c.paths, c.base_url is None))
        return configs

    def for_dir(self, directory: Path) -> List[TsConfig]:
        directory = directory.resolve()
        if directory in self._by_dir:
            return self._by_dir[directory]
        configs = self._configs_in(directory)
        if not configs:
            parent = directory.parent
            at_stop = self._stop_at is not None and directory == self._stop_at.parent
            if parent != directory and not at_stop:
                configs = self.for_dir(parent)
        self._by_dir[directory] = configs
        return configs
