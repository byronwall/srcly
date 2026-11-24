import { useRouter } from "next/navigation";
import "./next-kit";

// `router.push(href)` and `router.replace(href)` send the page to a URL: a
// proven end, not an assumed one. `URLSearchParams.set` changes only the
// object the program holds, so the value goes on to where that object is
// handed, never a browser write at `set`.
export function Sorter(props: { sort: string; slug: string }) {
  const router = useRouter();
  const apply = () => {
    const next = new URLSearchParams();
    next.set("sort", props.sort); // @trace router-replace forward props.sort @outcome router-replace ok
    router.replace(`?${next.toString()}`); // @reaches router-replace external-effect
  };
  const open = () => router.push(`/p/${props.slug}`); // @trace router-push forward props.slug @outcome router-push ok @reaches router-push external-effect
  return <button onClick={apply} onDoubleClick={open}>sort</button>;
}
