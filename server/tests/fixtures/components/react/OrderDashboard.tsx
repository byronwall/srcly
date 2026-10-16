import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";

interface BaseProps {
  title: string;
  subtitle?: string;
}

interface OrderDashboardProps extends BaseProps {
  orders: Order[];
  customers: Customer[];
  onRefund: (id: string) => void;
  onCancel: (id: string) => void;
  onExport: () => void;
  filter: string;
  pageSize: number;
}

type Order = { id: string; total: number; status: string; customerId: string };
type Customer = { id: string; name: string; vip: boolean };

// The god component: state, effects, handlers and branching all in one place.
export function OrderDashboard({ title, subtitle, orders, customers, onRefund, onCancel, onExport, filter, pageSize }: OrderDashboardProps) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [state, dispatch] = useReducer((s: number, a: number) => s + a, 0);
  const tableRef = useRef<HTMLTableElement>(null);
  const visible = useMemo(() => orders.filter((o) => o.status.includes(filter)), [orders, filter]);
  const byCustomer = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const refresh = useCallback(() => dispatch(1), []);

  useEffect(() => {
    setPage(0);
  }, [filter]);

  useEffect(() => {
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  useLayoutEffect(() => {
    tableRef.current?.scrollTo(0, 0);
  }, [page]);

  const rows = visible.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <section className="dashboard">
      <header>
        <h1>{title}</h1>
        {subtitle && <h2>{subtitle}</h2>}
        <button onClick={() => onExport()}>Export</button>
        <button onClick={() => setExpanded(!expanded)}>{expanded ? "Collapse" : "Expand"}</button>
      </header>
      {rows.length === 0 ? (
        <p className="empty">No orders</p>
      ) : (
        <table ref={tableRef}>
          <tbody>
            {rows.map((order) => (
              <tr key={order.id} onClick={() => setSelected(order.id)}>
                <td>
                  <span>
                    {byCustomer.get(order.customerId)?.vip ? <strong>{order.id}</strong> : <em>{order.id}</em>}
                  </span>
                </td>
                <td>{order.total}</td>
                <td>
                  {selected === order.id && (
                    <div className="actions">
                      <button onClick={() => onRefund(order.id)}>Refund</button>
                      <button onClick={() => onCancel(order.id)}>Cancel</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {expanded && <footer>{state} refreshes</footer>}
      <nav>
        <button onClick={() => setPage(page - 1)} disabled={page === 0}>Prev</button>
        <button onClick={() => setPage(page + 1)}>Next</button>
      </nav>
    </section>
  );
}

// A small, healthy component in the same file.
export const OrderBadge = ({ status }: { status: string }) => <span className="badge">{status}</span>;
