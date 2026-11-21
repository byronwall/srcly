import { UserCard } from "./UserCard";

type User = { name: string; email: string };
type Settings = { theme: string; density: string };

export function Dashboard(props: { user: User; settings: Settings }) {
  return (
    <main class={props.settings.theme}>
      <UserCard user={props.user} />
    </main>
  );
}
