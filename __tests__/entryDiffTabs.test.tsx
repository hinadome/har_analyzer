import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EntryDiffTabs } from "@/components/entry-diff/EntryDiffTabs";

describe("EntryDiffTabs", () => {
  it("renders tabs with status chips and switches section", () => {
    const onSectionChange = vi.fn();

    render(
      <EntryDiffTabs
        section="headers"
        onSectionChange={onSectionChange}
        headerStatus="2 changes"
        contentStatus="identical"
      />,
    );

    expect(screen.getByRole("tab", { name: /Headers/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("2 changes")).toBeInTheDocument();
    expect(screen.getByText("identical")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Content/i }));
    expect(onSectionChange).toHaveBeenCalledWith("content");
  });
});
