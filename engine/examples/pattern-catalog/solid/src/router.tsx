import { A, useNavigate, useParams, useSearchParams } from "@solidjs/router";

// S19 route params into a fetch-free render
export function Story() {
  const params = useParams();
  return <h1>{params.id}</h1>; // @trace s-params backward params.id @want external-read
}

// S20 search params write
export function Filter() {
  const [search, setSearch] = useSearchParams();
  return <input value={search.q ?? ""} onInput={(e) => setSearch({ q: e.currentTarget.value })} />; // @trace s-search-write forward e.currentTarget.value @want external-effect
}

// S21 navigate with a value
export function Jump(props: { id: string }) { // @trace s-navigate forward props.id @want external-effect
  const navigate = useNavigate();
  return <button onClick={() => navigate(`/story/${props.id}`)}>go</button>;
}

// S22 A href
export function Link(props: { slug: string }) { // @trace s-link forward props.slug @want dom-terminal
  return <A href={`/p/${props.slug}`}>open</A>;
}
