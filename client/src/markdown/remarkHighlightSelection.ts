interface HighlightSelectionOptions {
  startLine: number;
  endLine: number;
}

export function remarkHighlightSelection(options: HighlightSelectionOptions) {
  const { startLine, endLine } = options;

  const blockTypes = new Set([
    "heading",
    "paragraph",
    "list",
    "listItem",
    "code",
    "blockquote",
    "table",
    "thematicBreak",
  ]);

  // We sometimes receive an endLine that actually corresponds to the *next*
  // heading that closes the current scope. Detect that pattern and tighten
  // the effective end so we don't accidentally include the next section's
  // heading in the highlight.
  let selectionEnd = endLine;

  function scanForBoundaryHeading(node: any) {
    if (!node || typeof node !== "object") return;

    const position = (node as any).position;
    if (
      (node as any).type === "heading" &&
      position &&
      typeof position.start?.line === "number" &&
      position.start.line === endLine
    ) {
      selectionEnd = Math.max(startLine, endLine - 1);
    }

    if (Array.isArray((node as any).children)) {
      for (const child of (node as any).children) {
        scanForBoundaryHeading(child);
      }
    }
  }

  function walk(node: any, parentMarked: boolean) {
    if (!node || typeof node !== "object") return;

    let markedHere = false;
    const position = (node as any).position;

    if (
      !parentMarked &&
      position &&
      typeof position.start?.line === "number" &&
      typeof position.end?.line === "number"
    ) {
      const nodeStart = position.start.line;
      const nodeEnd = position.end.line;
      // Require the node to be fully contained in the effective selection range
      // so that the first block *after* the scope (e.g. the next heading) is
      // not accidentally included when positions share boundary lines.
      const fullyWithin = nodeStart >= startLine && nodeEnd <= selectionEnd;

      if (fullyWithin && blockTypes.has((node as any).type)) {
        const data = ((node as any).data ||= {});
        const hProperties = (data.hProperties ||= {});
        // Mark this node as part of the true selection; a rehype plugin
        // will later wrap contiguous marked elements in a single container.
        hProperties["data-in-selection"] = "true";
        (node as any).data = data;
        markedHere = true;
      }
    }

    const nextParentMarked = parentMarked || markedHere;

    if (Array.isArray((node as any).children)) {
      for (const child of (node as any).children) {
        walk(child, nextParentMarked);
      }
    }
  }

  return (tree: any) => {
    scanForBoundaryHeading(tree);
    walk(tree, false);
  };
}


