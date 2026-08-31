import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ContentDiffRedirect from "@/app/content-diff/page";
import HeaderDiffRedirect from "@/app/header-diff/page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

describe("legacy entry-diff redirects", () => {
  beforeEach(() => {
    replace.mockClear();
    window.history.replaceState({}, "", "/content-diff?url=%2Fhello");
  });

  it("content-diff replaces once to entry-diff with section=content", () => {
    render(<ContentDiffRedirect />);
    expect(screen.getByText(/Opening entry diff/i)).toBeInTheDocument();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      "/entry-diff?url=%2Fhello&section=content",
    );
  });

  it("header-diff replaces once to entry-diff with section=headers", () => {
    window.history.replaceState({}, "", "/header-diff?url=%2Fhello");
    render(<HeaderDiffRedirect />);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      "/entry-diff?url=%2Fhello&section=headers",
    );
  });
});
