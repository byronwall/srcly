import { UserCard } from "./UserCard";

type User = { name: string; email: string };
type Settings = { theme: string; density: string };

function Shell(props: { settings: Settings; user: User }) {
  return <Frame settings={props.settings} user={props.user} />;
}

function Frame(props: { settings: Settings; user: User }) {
  return (
    <section class={props.settings.density ?? "comfortable"}>
      <UserCard user={props.user} />
    </section>
  );
}

export function Dashboard(props: { user: User; settings: Settings }) {
  return (
    <main class={props.settings.theme}>
      <Shell settings={props.settings} user={props.user} />
    </main>
  );
}
