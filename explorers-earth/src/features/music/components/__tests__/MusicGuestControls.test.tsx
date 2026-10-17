import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MusicGuestControls } from "../MusicGuestControls";

const value = { allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false };

describe("MusicGuestControls", () => {
  it("persists all five canonical settings as one owner-scoped update", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MusicGuestControls value={value} onSave={onSave} />);
    expect(screen.getAllByRole("switch")).toHaveLength(5);
    expect(screen.getAllByText("Allow song requests")).toHaveLength(1);
    expect(screen.getByRole("switch", { name: "Show queue" })).toHaveAttribute("aria-checked", "false");
    await userEvent.click(screen.getByRole("switch", { name: "Allow song requests" }));
    expect(onSave).toHaveBeenCalledWith({ ...value, allowSongRequests: false });
  });

  it("disables mutations while the workspace is read-only", () => {
    render(<MusicGuestControls value={value} onSave={vi.fn()} readOnly />);
    for (const control of screen.getAllByRole("switch")) expect(control).toBeDisabled();
  });

  it("keeps pending and rollback state local to the changed shared switch", async () => {
    let reject!: (reason?: unknown) => void;
    const pending = new Promise<void>((_resolve, no) => { reject = no; });
    const onSave = vi.fn().mockReturnValue(pending);
    render(<MusicGuestControls value={value} onSave={onSave} />);
    const requests = screen.getByRole("switch", { name: "Allow song requests" });
    const playback = screen.getByRole("switch", { name: "Allow playback on guest devices" });

    await userEvent.click(requests);
    expect(requests).toHaveAttribute("aria-checked", "false");
    expect(requests).toBeDisabled();
    expect(playback).toBeEnabled();

    await act(async () => reject(new Error("offline")));
    expect(requests).toHaveAttribute("aria-checked", "true");
    expect(requests).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Allow song requests could not be saved");
    expect(requests).toHaveAttribute("aria-describedby", expect.stringMatching(/guest-control-error/));
  });

  it("rolls back only the rejected control when another control saves", async () => {
    let rejectRequests!: (reason?: unknown) => void;
    const requestsPending = new Promise<void>((_resolve, reject) => { rejectRequests = reject; });
    const onSave = vi.fn().mockReturnValueOnce(requestsPending).mockResolvedValueOnce(undefined);
    render(<MusicGuestControls value={value} onSave={onSave} />);
    const requests = screen.getByRole("switch", { name: "Allow song requests" });
    const playback = screen.getByRole("switch", { name: "Allow playback on guest devices" });

    await userEvent.click(requests);
    await userEvent.click(playback);
    expect(playback).toHaveAttribute("aria-checked", "true");
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => rejectRequests(new Error("offline")));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));

    expect(requests).toHaveAttribute("aria-checked", "true");
    expect(playback).toHaveAttribute("aria-checked", "true");
    expect(onSave.mock.calls[1][0]).toEqual({ ...value, allowGuestPlayOnDevice: true });
  });

  it("reconciles non-pending controls from a new canonical snapshot", () => {
    const view = render(<MusicGuestControls value={value} onSave={vi.fn()} />);
    const requests = screen.getByRole("switch", { name: "Allow song requests" });
    view.rerender(<MusicGuestControls value={{ ...value, allowSongRequests: false }} onSave={vi.fn()} />);
    expect(requests).toHaveAttribute("aria-checked", "false");
  });
});
