// A helper called from more places than the anchor graph walks (32): every
// call is drawn where it is, the first ones are walked, and the rest fold
// into one frontier that says how many were not followed.
export function label(n: number) {
  return n;
}

export function labels() {
  return [
    label(0),
    label(1),
    label(2),
    label(3),
    label(4),
    label(5),
    label(6),
    label(7),
    label(8),
    label(9),
    label(10),
    label(11),
    label(12),
    label(13),
    label(14),
    label(15),
    label(16),
    label(17),
    label(18),
    label(19),
    label(20),
    label(21),
    label(22),
    label(23),
    label(24),
    label(25),
    label(26),
    label(27),
    label(28),
    label(29),
    label(30),
    label(31),
    label(32),
    label(33),
    label(34),
    label(35),
    label(36),
    label(37),
    label(38),
    label(39),
  ];
}
