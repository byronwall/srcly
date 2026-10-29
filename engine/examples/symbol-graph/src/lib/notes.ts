import type { NoteRow } from "../server/db";

export type NoteDetail = { id: string; title: string; tags: string[]; sourceId: string | null };

export function parseTags(json: string): string[] {
  const raw = JSON.parse(json) as string[];
  return raw.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
}

export function toDetail(row: NoteRow): NoteDetail {
  const tags = parseTags(row.tagsJson);
  return { id: row.id, title: row.title.trim(), tags, sourceId: row.sourceId };
}

export function formatTags(tags: string[]): string {
  return tags.map((tag) => `#${tag}`).join(" ");
}
