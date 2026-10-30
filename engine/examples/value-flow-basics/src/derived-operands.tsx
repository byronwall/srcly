// An operator expression carries its operands into its value: `props.count`
// reaches the slot through a template and arithmetic. A derived value
// nothing reads ends there, never read: `props.limit` ends at `tooMany`.
export function Count(props: { count: number; limit: number }) {
  const tooMany = props.limit > 3; // @trace limit forward props.limit @outcome limit ok @reaches limit alias "tooMany"
  return <span>{`${props.count + 1} items`}</span>; // @trace count forward props.count @outcome count ok @visits count derived @reaches count render-terminal
}
