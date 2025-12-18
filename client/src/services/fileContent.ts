export async function fetchFileContent(args: {
  path: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<string> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const res = await fetchImpl(`/api/files/content?path=${encodeURIComponent(args.path)}`, {
    signal: args.signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to load file: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}


