export type Row = { id: string; label: string };

const SEED: Row[] = [{ id: "1", label: "first" }];

export async function loadRows(): Promise<Row[]> {
  return SEED;
}
