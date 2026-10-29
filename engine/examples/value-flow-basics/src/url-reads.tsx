// The router is not installed here: the engine knows its hooks by the module their import names.
import { useParams, useSearchParams } from "@solidjs/router";

// What a router reads from the page's URL is where a page's input starts:
// a route parameter, or the query string.
export function NotePage() {
  const params = useParams(); // @reaches route-id external-read
  const [search] = useSearchParams(); // @reaches url-query external-read
  return (
    <p>
      {/* @trace route-id backward params.id @outcome route-id ok @trace url-query backward search.q @outcome url-query ok */}
      {params.id} {search.q}
    </p>
  );
}
