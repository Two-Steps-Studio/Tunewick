import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("states plainly that the product is under construction", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("tunewick");
    expect(screen.getByText(/w budowie/)).toBeInTheDocument();
  });
});
