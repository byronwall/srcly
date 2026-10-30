// V1 input event value written to the page
export function mirror(input: HTMLInputElement, out: HTMLElement) {
  input.addEventListener("input", (event) => {
    const value = (event.target as HTMLInputElement).value; // @trace v-input-event forward (event.target as HTMLInputElement).value @want field-read
    out.textContent = value.trim();
  });
}

// V2 querySelector + dataset read into a class toggle
export function markActive(root: HTMLElement) {
  const button = root.querySelector<HTMLButtonElement>("button.tab");
  const tab = button?.dataset.tab ?? "home"; // @trace v-dataset forward button?.dataset.tab @want external-effect
  root.classList.toggle(`tab-${tab}`, true);
}

// V3 innerHTML render from a list
export function renderList(list: HTMLUListElement, items: string[]) { // @trace v-render-list forward symbol items @want field-read
  list.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

// V4 form submit reads FormData and posts it
export function wireForm(form: HTMLFormElement) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("name") ?? ""); // @trace v-formdata forward String(data.get("name") ?? "") @want external-effect
    await fetch("/api/people", { method: "POST", body: JSON.stringify({ name }) });
  });
}

// V5 custom event dispatch and listen
export function announce(target: EventTarget, message: string) { // @trace v-custom-event forward symbol message @want external-effect
  target.dispatchEvent(new CustomEvent("announce", { detail: message }));
}
