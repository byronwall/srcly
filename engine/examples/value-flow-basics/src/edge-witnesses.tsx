// Two relations can join the same two boxes. `props.active` is an operand of
// the comparison (`references`) and the exact field read in the prop's value
// (`consumer-value`): the graph keeps both witnesses, which the client draws
// as one edge.
function StepButton(props: { disabled: boolean }) {
  return <button disabled={props.disabled} />; // @reaches witness-pair dom-terminal
}

export function Stepper(props: { active: number }) {
  return <StepButton disabled={props.active === 0} />; // @trace witness-pair forward props.active @edge witness-pair references proven ast-node @edge witness-pair consumer-value proven jsx-consumer-value @reaches witness-pair component-occurrence
}
