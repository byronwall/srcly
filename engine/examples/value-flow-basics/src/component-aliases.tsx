// Components made by a factory or an alias, not written as a function. A
// JSX tag that names one renders it: `<Badge>` is where `Badge` is used.
// `Plain` is `Card` under another name, so its tag binds Card's props;
// `Badge` and `Pill` come from a library factory, so a prop handed to them
// ends at their occurrence. `Badge` and `Pill` are two values of one
// factory: rendering one never renders the other. A value nothing renders
// or reads (`Unused`, `labels`) is still a dead end. A shorthand `{ point }`
// packs the value `point` names.
import { styled } from "ui-kit";

function Card(props: { title: string }) {
  return <h2>{props.title}</h2>;
}

export const Plain = Card;
export const Badge = styled(Card, "badge");
export const Pill = styled(Card, "pill");
export const Unused = styled(Card, "unused");
export const labels = { badge: "Badge" };

export function Shelf(props: { name: string; tone: string }) {
  const point = props.name;
  const packed = { point };
  return (
    <section>
      <Plain title={props.name} />
      <Badge title={props.tone}>{props.tone}</Badge>
      {packed.point}
    </section>
  );
}

export function Tag() {
  return <Pill title="pill" />;
}

// A shorthand reads the binding its name resolves to in scope: the inner
// `point` shadows the outer one, so the outer value never reaches `show()`.
export function Shadow(props: { name: string; note: string }) {
  const point = props.name;
  const show = () => {
    const point = props.note;
    return { point };
  };
  return (
    <p>
      {point}
      {show().point}
    </p>
  );
}
