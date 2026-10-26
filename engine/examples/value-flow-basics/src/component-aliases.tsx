// Components made by a factory or an alias, not written as a function. A
// JSX tag that names one renders it: `<Badge>` is where `Badge` is used.
// `Plain` is `Card` under another name, so its tag binds Card's props;
// `Badge` and `Pill` come from a library factory, so a prop handed to them
// ends at their occurrence. `Badge` and `Pill` are two values of one
// factory: rendering one never renders the other. An exported value nothing
// in the program renders or reads (`Unused`, `labels`) ends at its export, the
// module's API. A shorthand `{ point }`
// packs the value `point` names.
import { styled } from "ui-kit";

function Card(props: { title: string }) {
  return <h2>{props.title}</h2>; // @reaches name render-terminal
}

export const Plain = Card; // @trace plain forward symbol Plain
export const Badge = styled(Card, "badge"); // @trace badge forward symbol Badge @outcome badge ok
export const Pill = styled(Card, "pill"); // @trace pill forward symbol Pill
export const Unused = styled(Card, "unused"); // @trace unused-factory forward symbol Unused @outcome unused-factory ok @reaches unused-factory alias "Unused"
export const labels = { badge: "Badge" }; // @trace labels-object forward symbol labels @outcome labels-object ok @reaches labels-object alias "labels"

export function Shelf(props: { name: string; tone: string }) {
  const point = props.name; // @trace point forward symbol point @outcome point ok
  const packed = { point };
  return (
    <section>
      {/* `Plain` is `Card` under another name: its tag binds Card's props, so `props.name` reaches Card's slot. */}
      {/* @trace name forward props.name @outcome name ok @reaches plain,name component-occurrence */}
      <Plain title={props.name} />
      {/* A library factory's component: its prop and child are handed to the occurrence, never a DOM attribute. */}
      {/* @trace tone forward props.tone @reaches tone component-occurrence @reaches badge component-occurrence "Badge" */}
      <Badge title={props.tone}>{props.tone}</Badge>
      {/* @reaches point render-terminal */}
      {packed.point}
    </section>
  );
}

export function Tag() {
  return <Pill title="pill" />; // @reaches pill @never-reaches badge
}

// A shorthand reads the binding its name resolves to in scope: the inner
// `point` shadows the outer one, so the outer value never reaches `show()`.
export function Shadow(props: { name: string; note: string }) {
  const point = props.name; // @trace outer-point forward symbol point
  const show = () => {
    const point = props.note; // @trace inner-point forward symbol point
    return { point };
  };
  return (
    <p>
      {/* @reaches outer-point @never-reaches inner-point */}
      {point}
      {/* @reaches inner-point */}
      {show().point}
    </p>
  );
}
