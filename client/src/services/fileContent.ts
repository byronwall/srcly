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


