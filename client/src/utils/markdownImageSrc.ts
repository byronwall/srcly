function isExternalOrAbsoluteUrl(src: string): boolean {
  const s = src.toLowerCase();
  return (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:") ||
    s.startsWith("mailto:") ||
    s.startsWith("/") ||
    s.startsWith("#")
  );
}

export function resolveMarkdownImageSrc(
  src: string,
  filePath: string | null
): string {
  if (!src) return src;
  if (isExternalOrAbsoluteUrl(src)) return src;
  if (!filePath) return src;

  const lastSlash = filePath.lastIndexOf("/");
  const dir = lastSlash >= 0 ? filePath.slice(0, lastSlash) : "";

  const parts = dir ? dir.split("/").filter(Boolean) : [];
  const relParts = src.split("/").filter((p) => p.length > 0);

  for (const part of relParts) {
    if (part === ".") continue;
    if (part === "..") {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(part);
  }

  const absPath = parts.join("/");
  return `/api/files/content?path=${encodeURIComponent(absPath)}`;
}


