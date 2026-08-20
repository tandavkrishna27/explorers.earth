import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import OnboardingCheckError from "../OnboardingCheckError";

describe("OnboardingCheckError (recoverable onboarding-check failure)", () => {
  it("calls onRetry when 'Try again' is clicked", () => {
    const onRetry = vi.fn();
    const onLogout = vi.fn();
    render(<OnboardingCheckError onRetry={onRetry} onLogout={onLogout} />);
    fireEvent.click(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("calls onLogout when 'Log out' is clicked", () => {
    const onRetry = vi.fn();
    const onLogout = vi.fn();
    render(<OnboardingCheckError onRetry={onRetry} onLogout={onLogout} />);
    fireEvent.click(screen.getByText("Log out"));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
