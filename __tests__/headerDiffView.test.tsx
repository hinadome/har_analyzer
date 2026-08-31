import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HeaderDiffView from "@/components/HeaderDiffView";
import type { HeaderDiffResult } from "@/utils/headerDiff";

const emptyResult: HeaderDiffResult = {
  requestHeaders: [],
  responseHeaders: [],
  requestCookies: [],
  responseCookies: [],
  identical: true,
};

describe("HeaderDiffView layout", () => {
  it("renders four section cards with consistent titles", () => {
    render(<HeaderDiffView result={emptyResult} />);

    expect(
      screen.getByRole("heading", { name: "Request Headers" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Response Headers" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Request Cookies" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Response Cookies" }),
    ).toBeInTheDocument();

    expect(screen.getAllByText("None")).toHaveLength(4);
    expect(screen.getAllByText("empty")).toHaveLength(4);
  });

  it("shows section status badges for identical vs empty sections", () => {
    const result: HeaderDiffResult = {
      requestHeaders: [
        {
          name: "Accept",
          baseValue: "text/html",
          compareValue: "text/html",
          kind: "equal",
        },
      ],
      responseHeaders: [
        {
          name: "Content-Type",
          baseValue: "text/plain",
          compareValue: "application/json",
          kind: "changed",
        },
      ],
      requestCookies: [],
      responseCookies: [],
      identical: false,
    };

    render(<HeaderDiffView result={result} />);

    expect(screen.getByText("identical")).toBeInTheDocument();
    expect(screen.getByText("1 change")).toBeInTheDocument();
    expect(screen.getAllByText("empty")).toHaveLength(2);
  });
});
