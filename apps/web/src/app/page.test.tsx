import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders home actions", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: /multiplayer strategy match/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create room/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join by code/i })).toBeInTheDocument();
  });
});
