// What the browser holds outside the program is named where the program
// reads or writes it: the URL and the cookie are a page's input, storage and
// history are read and written, a page property (`document.title`) is written
// into the page, and an `addEventListener` callback receives the event.
export function restore() {
  const tab = new URLSearchParams(location.search).get("tab"); // @trace url-tab backward symbol tab @outcome url-tab ok @reaches url-tab external-read
  const saved = localStorage.getItem("tab"); // @trace stored-tab backward symbol saved @outcome stored-tab ok @reaches stored-tab external-read
  return tab ?? saved;
}

export function show(title: string) { // @trace page-title forward symbol title @outcome page-title ok
  document.title = title; // @reaches page-title external-effect
  localStorage.setItem("title", title); // @reaches page-title external-effect
  history.pushState(null, "", `/notes/${title}`); // @reaches page-title external-effect
}

export function listen(input: HTMLInputElement) {
  input.addEventListener("input", (event) => { // @reaches typed-event parameter
    // @trace typed-event backward event.target
    console.log(event.target);
  });
}
