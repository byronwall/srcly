import { renderToString } from "solid-js/web";
import App from "./App";

export function renderPage(path: string) {
  return renderToString(() => <App path={path} />);
}
