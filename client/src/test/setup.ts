import catalog from "../../../server/tests/snapshots/metric-catalog.json";
import { setMetricCatalog, type MetricCatalog } from "../utils/metricsStore";

// The server's catalog, as `GET /api/metrics/catalog` serves it. The server
// owns this snapshot: its test fails when the snapshot is stale.
setMetricCatalog(catalog as MetricCatalog);
