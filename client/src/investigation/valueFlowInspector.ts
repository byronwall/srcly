// The code viewer's value-flow inspection: a caret → the engine's candidate
// expressions → one ledger. Owns its requests so a newer inspection always
// replaces an older one.
import { createSignal } from "solid-js";
import { fetchValueFlow, selectExpression } from "../dataflow/api";
import { watchProgress } from "../dataflow/availability";
import type { SelectExpressionResult, ValueFlowResult } from "../dataflow/contract.generated";
import { labelFor } from "../dataflow/outcome";
import { caretSpan } from "./selectionSpan";

export type Candidate = SelectExpressionResult["candidates"][number];
export type MenuState = { x: number; y: number; line: number; column: number };
/** What a picked expression does: the ledger in the rail, or the anchor graph traced one way. */
export type InspectAction = "ledger" | "forward" | "backward";
export type PickerState = { x: number; y: number; loading: boolean; candidates: Candidate[]; message: string | null; action: InspectAction };
export type LedgerState =
  | { phase: "loading"; text: string }
  | { phase: "done"; ledger: ValueFlowResult }
  | { phase: "na"; message: string };

export function createValueFlowInspector(opts: {
  root: () => string | undefined;
  file: () => string | null;
  /** "Trace where it goes / comes from": open the graph anchored at the candidate. */
  onTrace?: (candidate: Candidate, direction: "forward" | "backward") => void;
}) {
  const [menu, setMenu] = createSignal<MenuState | null>(null);
  const [picker, setPicker] = createSignal<PickerState | null>(null);
  const [ledger, setLedger] = createSignal<LedgerState | null>(null);
  let token = 0;
  let pending: InspectAction = "ledger";

  const request = () => {
    const path = opts.root();
    const file = opts.file();
    return path && file ? { path, file } : null;
  };

  /** A menu item at the caret: one candidate runs, several open the picker. */
  const inspect = async (action: InspectAction = "ledger") => {
    const at = menu();
    const req = request();
    setMenu(null);
    if (!at || !req) return;
    pending = action;
    const mine = ++token;
    setPicker({ x: at.x, y: at.y, loading: true, candidates: [], message: null, action });
    try {
      const res = await watchProgress(req.path, selectExpression({ ...req, span: caretSpan(at.line, at.column) }));
      if (mine !== token) return;
      const candidates = res.result?.candidates ?? [];
      if (candidates.length === 1) {
        setPicker(null);
        void run(candidates[0]);
        return;
      }
      const message = candidates.length ? null : res.result?.reason ?? labelFor(res.outcome, res.reason as never, res.message) ?? "Nothing to inspect here";
      setPicker({ x: at.x, y: at.y, loading: false, candidates, message, action });
    } catch (e) {
      if (mine === token) setPicker({ x: at.x, y: at.y, loading: false, candidates: [], message: String((e as Error)?.message ?? e), action });
    }
  };

  /** The ledger for one candidate expression, or the graph traced from it. */
  const run = async (candidate: Candidate) => {
    const req = request();
    setPicker(null);
    if (!req) return;
    if (pending !== "ledger") {
      opts.onTrace?.(candidate, pending);
      return;
    }
    const mine = ++token;
    setLedger({ phase: "loading", text: candidate.text });
    try {
      const res = await watchProgress(req.path, fetchValueFlow({ ...req, span: candidate.span, text: candidate.text }));
      if (mine !== token) return;
      if (res.ledger) setLedger({ phase: "done", ledger: res.ledger });
      else setLedger({ phase: "na", message: labelFor(res.outcome, res.reason as never, res.message) ?? res.message ?? "No ledger" });
    } catch (e) {
      if (mine === token) setLedger({ phase: "na", message: String((e as Error)?.message ?? e) });
    }
  };

  return {
    menu,
    picker,
    ledger,
    openMenu: (state: MenuState) => {
      setPicker(null);
      setMenu(state);
    },
    closeMenus: () => {
      setMenu(null);
      setPicker(null);
    },
    inspect,
    run,
    clear: () => {
      token++;
      setLedger(null);
      setPicker(null);
      setMenu(null);
    },
  };
}

export type ValueFlowInspector = ReturnType<typeof createValueFlowInspector>;
