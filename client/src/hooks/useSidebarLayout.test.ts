// @vitest-environment jsdom
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { useSidebarLayout } from "./useSidebarLayout";

// Data flow folds the file tree on a narrow window without overwriting the
// collapsed state the user chose.
describe("the sidebar's auto-collapse", () => {
  afterEach(() => window.localStorage.clear());

  const mount = () =>
    createRoot((dispose) => {
      const [narrow, setNarrow] = createSignal(false);
      const sidebar = useSidebarLayout();
      sidebar.autoCollapse(narrow);
      return { sidebar, setNarrow, dispose };
    });

  it("folds while the condition holds and reopens afterwards, remembering nothing", () => {
    const { sidebar, setNarrow, dispose } = mount();
    setNarrow(true);
    expect(sidebar.collapsed()).toBe(true);
    expect(window.localStorage.getItem("srcly.sidebar.collapsed")).toBeNull();
    setNarrow(false);
    expect(sidebar.collapsed()).toBe(false);
    dispose();
  });

  it("keeps the user's choice once they make one", () => {
    const { sidebar, setNarrow, dispose } = mount();
    setNarrow(true);
    sidebar.setCollapsed(false);
    setNarrow(false);
    expect(sidebar.collapsed()).toBe(false);
    setNarrow(true);
    sidebar.setCollapsed(true);
    setNarrow(false);
    // Collapsed by the user, so it stays shut.
    expect(sidebar.collapsed()).toBe(true);
    dispose();
  });
});
