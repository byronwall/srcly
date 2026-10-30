// A parameter or local binding nothing reads ends there, never read: the
// checker finds no read of it, so the value it holds goes nowhere. One the
// code does read walks on, and a parameter property is read through its member.
export function areaOf(_level: number, area: string) { // @trace unread-param backward symbol areaOf
  return area.toUpperCase();
}

export function status(result: { ok: boolean; error: string }) { // @trace unread-alias forward symbol result @outcome unread-alias ok
  const { ok, error } = result;
  return ok; // @reaches unread-alias return
}

export class Grid {
  constructor(private readonly width: number, private readonly unusedHeight: number) {} // @trace grid-height forward unusedHeight @outcome grid-height ok
  get size() {
    return this.width;
  }
}
