"use server";

// R69 a server action: a form field reaches a request
export async function createPost(formData: FormData) { // @trace n-server-action forward formData @want external-effect
  const title = formData.get("title");
  await fetch("https://api.example.com/posts", { method: "POST", body: JSON.stringify({ title }) });
}
