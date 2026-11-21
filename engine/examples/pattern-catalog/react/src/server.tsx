// R70 an async server component fetches and passes data to a client component
async function getPost(slug: string) {
  const res = await fetch(`https://api.example.com/posts/${slug}`);
  return res.json() as Promise<{ title: string; body: string }>;
}

function PostBody(props: { body: string }) {
  return <article>{props.body}</article>; // @trace n-server-to-client backward props.body @want fetch-input
}

export default async function PostPage({ params }: { params: { slug: string } }) { // @trace n-page-params forward params.slug @want external-effect
  const post = await getPost(params.slug);
  return <main><h1>{post.title}</h1><PostBody body={post.body} /></main>;
}
