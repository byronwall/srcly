// One prop read by more expressions than a slice takes (128 elements). The
// forward walk from `props` stops at its limit; every element it did not
// take is one gap from the same place, and the anchor graph folds them
// into one frontier.
export function Wide(props: { n: number }) {
  return (
    <ul>
      <li>{props.n + 0}</li>
      <li>{props.n + 1}</li>
      <li>{props.n + 2}</li>
      <li>{props.n + 3}</li>
      <li>{props.n + 4}</li>
      <li>{props.n + 5}</li>
      <li>{props.n + 6}</li>
      <li>{props.n + 7}</li>
      <li>{props.n + 8}</li>
      <li>{props.n + 9}</li>
      <li>{props.n + 10}</li>
      <li>{props.n + 11}</li>
      <li>{props.n + 12}</li>
      <li>{props.n + 13}</li>
      <li>{props.n + 14}</li>
      <li>{props.n + 15}</li>
      <li>{props.n + 16}</li>
      <li>{props.n + 17}</li>
      <li>{props.n + 18}</li>
      <li>{props.n + 19}</li>
      <li>{props.n + 20}</li>
      <li>{props.n + 21}</li>
      <li>{props.n + 22}</li>
      <li>{props.n + 23}</li>
      <li>{props.n + 24}</li>
      <li>{props.n + 25}</li>
      <li>{props.n + 26}</li>
      <li>{props.n + 27}</li>
      <li>{props.n + 28}</li>
      <li>{props.n + 29}</li>
      <li>{props.n + 30}</li>
      <li>{props.n + 31}</li>
      <li>{props.n + 32}</li>
      <li>{props.n + 33}</li>
      <li>{props.n + 34}</li>
      <li>{props.n + 35}</li>
      <li>{props.n + 36}</li>
      <li>{props.n + 37}</li>
      <li>{props.n + 38}</li>
      <li>{props.n + 39}</li>
      <li>{props.n + 40}</li>
      <li>{props.n + 41}</li>
      <li>{props.n + 42}</li>
      <li>{props.n + 43}</li>
      <li>{props.n + 44}</li>
      <li>{props.n + 45}</li>
      <li>{props.n + 46}</li>
      <li>{props.n + 47}</li>
      <li>{props.n + 48}</li>
      <li>{props.n + 49}</li>
      <li>{props.n + 50}</li>
      <li>{props.n + 51}</li>
      <li>{props.n + 52}</li>
      <li>{props.n + 53}</li>
      <li>{props.n + 54}</li>
      <li>{props.n + 55}</li>
      <li>{props.n + 56}</li>
      <li>{props.n + 57}</li>
      <li>{props.n + 58}</li>
      <li>{props.n + 59}</li>
      <li>{props.n + 60}</li>
      <li>{props.n + 61}</li>
      <li>{props.n + 62}</li>
      <li>{props.n + 63}</li>
      <li>{props.n + 64}</li>
      <li>{props.n + 65}</li>
      <li>{props.n + 66}</li>
      <li>{props.n + 67}</li>
      <li>{props.n + 68}</li>
      <li>{props.n + 69}</li>
      <li>{props.n + 70}</li>
      <li>{props.n + 71}</li>
      <li>{props.n + 72}</li>
      <li>{props.n + 73}</li>
      <li>{props.n + 74}</li>
      <li>{props.n + 75}</li>
      <li>{props.n + 76}</li>
      <li>{props.n + 77}</li>
      <li>{props.n + 78}</li>
      <li>{props.n + 79}</li>
      <li>{props.n + 80}</li>
      <li>{props.n + 81}</li>
      <li>{props.n + 82}</li>
      <li>{props.n + 83}</li>
      <li>{props.n + 84}</li>
      <li>{props.n + 85}</li>
      <li>{props.n + 86}</li>
      <li>{props.n + 87}</li>
      <li>{props.n + 88}</li>
      <li>{props.n + 89}</li>
    </ul>
  );
}
