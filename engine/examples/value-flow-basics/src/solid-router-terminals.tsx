// The router is not installed here: the engine knows its hooks by the module their import names.
import { useNavigate, useSearchParams } from "@solidjs/router";
import { useNavigate as useKitNavigate } from "./router-kit";

// A `terminal` row with a `result` marks a function a hook hands back. Calling
// `navigate` (the hook's own value) or the setter half of `useSearchParams`
// (its tuple's element 1) is where the value leaves the program: modelled, so
// the trace is `ok`.
export function Jump(props: { id: string; label: string }) {
  const navigate = useNavigate();
  // @trace srt-navigate forward props.id @outcome srt-navigate ok @reaches srt-navigate external-effect @reaches srt-navigate return @edge srt-navigate effect-input proven framework-state @no-edge srt-navigate * * external-call
  const go = () => navigate(`/story/${props.id}`);
  return <button onClick={go}>{props.label}</button>; // @never-reaches srt-navigate
}

export function Filter(props: { q: string }) {
  // The getter half reads the URL. It is not the terminal.
  const [search, setSearch] = useSearchParams(); // @reaches srt-search-read external-read
  // @trace srt-search forward props.q @outcome srt-search ok @reaches srt-search external-effect @reaches srt-search return @edge srt-search effect-input proven framework-state
  const write = () => setSearch({ q: props.q });
  // @trace srt-search-read backward search.q @outcome srt-search-read ok @never-reaches srt-search
  return <p onClick={write}>{search.q}</p>;
}

// A hook no row names is not proven: nothing says what its function does, so the trace stops at the call.
export function Unmodelled(props: { to: string }) {
  const navigate = useKitNavigate();
  // @trace srt-unmodelled forward props.to @outcome srt-unmodelled partial @stop srt-unmodelled disconnected call @no-edge srt-unmodelled effect-input * *
  const go = () => navigate(props.to);
  return <button onClick={go}>go</button>;
}
