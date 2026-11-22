type User = { name: string; email: string };

export function UserCard(props: { user: User }) {
  return (
    <div>
      <b>{props.user.name}</b>
    </div>
  );
}
