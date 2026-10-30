// A compound assignment to a field (`tally.count += step`) writes the right
// side into the field, as `=` does. A handler handed to a page element
// (`onClick={click}`) is called by the page, which drops what it returns:
// its return ends there, not at an unproven hand-off.
export function Clicks(props: { step: number }) {
  const tally = { count: 0 };
  const click = () => {
    tally.count += props.step; // @trace compound forward props.step @outcome compound ok @reaches compound field-read "count"
    return tally.count; // @reaches compound return
  };
  return <button onClick={click}>+</button>;
}
