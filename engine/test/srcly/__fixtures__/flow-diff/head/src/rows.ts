export type Row = { id: string; label: string };

export async function loadRows(): Promise<Row[]> {
  const response = await fetch("/api/rows");
  return response.json();
}
