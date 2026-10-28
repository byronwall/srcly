// `o.title = value` packs the value into `o` under `title`, as `{ title: value }`
// would: a later read of that field sees it, and a read of another does not.
export function describe(title: string, size: number) { // @trace set-title forward symbol title
  const card: { title?: string; size?: number } = {};
  card.title = title; // @reaches set-title field-read
  card.size = size;
  console.log(card.title); // @reaches set-title
  return card.size; // @never-reaches set-title field-read
}
