export async function fetchFileContent(args: {
  path: string;
  /** Read the file from this git commit instead of the disk. */
  ref?: string | null;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<string> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const query = new URLSearchParams({ path: args.path });
  if (args.ref) query.set("ref", args.ref);
  const res = await fetchImpl(`/api/files/content?${query}`, {
    signal: args.signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to load file: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}



/** Where each metric fires in the file (see `utils/metricMarkers`). */
export async function fetchFileMarkers(args: {
  path: string;
  ref?: string | null;
  signal?: AbortSignal;
}): Promise<Record<string, { line: number; end_line: number; note: string }[]>> {
  const query = new URLSearchParams({ path: args.path });
  if (args.ref) query.set("ref", args.ref);
  const res = await fetch(`/api/files/markers?${query}`, { signal: args.signal });
  if (!res.ok) throw new Error(`Failed to locate metrics: ${res.status} ${res.statusText}`);
  const body = await res.json();
  return body.markers ?? {};
}
