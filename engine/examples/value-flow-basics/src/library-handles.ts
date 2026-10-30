// A call made for its effect through a function a library hands back, held
// under a local name (`navigate(url)` after `useNavigate()`), resolves to the
// library's declarations: the value leaves there, as an assumed effect. A
// call whose value the code uses is not an effect.
import { onSubmit, useLabel, useNavigate } from "./router-kit";

export function go(slug: string) { // @trace go forward symbol slug @outcome go assumed
  const navigate = useNavigate();
  navigate(`/p/${slug}`); // @reaches go external-effect
}

export function title(prefix: string) { // @trace label-read forward symbol prefix
  const label = useLabel();
  return `${prefix}: ${label()}`; // @never-reaches label-read external-effect @reaches label-read return
}

// A parameter of a function handed to a library (`onSubmit((values) => …)`)
// is filled by that library: a backward trace lands there.
export function wireSubmit(save: (name: string) => void) {
  onSubmit((values) => save(values.name)); // @trace filled backward values.name @outcome filled ok
}
