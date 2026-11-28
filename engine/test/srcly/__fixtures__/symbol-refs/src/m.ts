export type Row = { id: number };
export const Row = { id: 1 };

export class Store {
  count = 0;
  bump() {
    this.count += 1;
  }
}

export default function A() {
  return 1;
}
export type A = number;

export interface Model {
  id: number;
}
export const Model = { id: 1 };
