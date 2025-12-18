export function rehypeWrapSelection() {
  return (tree: any) => {
    if (!tree || !Array.isArray((tree as any).children)) return;

    function wrapChildren(node: any) {
      if (!node || !Array.isArray(node.children)) return;

      const newChildren: any[] = [];
      let buffer: any[] = [];

      const flushBuffer = () => {
        if (!buffer.length) return;
        newChildren.push({
          type: "element",
          tagName: "div",
          properties: { className: ["md-selected-range"] },
          children: buffer,
        });
        buffer = [];
      };

      for (const child of node.children) {
        const inSelection =
          child &&
          child.type === "element" &&
          child.properties &&
          (child.properties["data-in-selection"] === "true" ||
            child.properties["data-in-selection"] === true);

        const isWhitespaceText =
          child &&
          child.type === "text" &&
          typeof child.value === "string" &&
          /^\s*$/.test(child.value);

        if (inSelection || (isWhitespaceText && buffer.length > 0)) {
          buffer.push(child);
        } else {
          flushBuffer();
          newChildren.push(child);
        }
      }

      flushBuffer();
      node.children = newChildren;
    }

    // Only wrap at the top level; this matches how scopes are surfaced
    // in the structural analysis (as true container sections).
    wrapChildren(tree);
  };
}


