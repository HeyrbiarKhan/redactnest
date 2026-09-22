/**
 * `DropZone`, spec 0003, AC-8. One tab stop, and it still owns spec 0002's
 * rule that the input keeps no `FileList` once the file is in hand (AC-2).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DropZone } from "@/ui/drop-zone";

import { expectNoAxeViolations } from "../../setup/component";

function renderZone() {
  const onFile = vi.fn();
  const onWarm = vi.fn();
  const view = render(
    <DropZone
      title="Drop a PDF here, or choose one"
      helper="Up to 3 pages for now."
      buttonLabel="Choose a PDF"
      accept="application/pdf"
      onFile={onFile}
      onWarm={onWarm}
    />,
  );
  return { ...view, onFile, onWarm };
}

function pdf(name = "report.pdf"): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

describe("DropZone", () => {
  it("has exactly one tab stop, the visible button", async () => {
    const user = userEvent.setup();
    renderZone();

    await user.tab();
    expect(screen.getByRole("button", { name: "Choose a PDF" })).toHaveFocus();

    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it("keeps the native input out of the tab order and away from assistive technology", () => {
    renderZone();

    const input = screen.getByTestId("file-input");
    expect(input).toHaveAttribute("tabindex", "-1");
    expect(input).toHaveAttribute("aria-hidden", "true");
    expect(input).toHaveAttribute("accept", "application/pdf");
  });

  it("opens the picker from the button", async () => {
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
    renderZone();

    await userEvent.setup().click(screen.getByRole("button", { name: "Choose a PDF" }));

    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("hands over a chosen file and keeps no FileList afterwards", async () => {
    const { onFile } = renderZone();
    const file = pdf();

    await userEvent.setup().upload(screen.getByTestId("file-input"), file);

    expect(onFile).toHaveBeenCalledWith(file);
    const input = screen.getByTestId<HTMLInputElement>("file-input");
    expect(input.value).toBe("");
    expect(input.files).toHaveLength(0);
  });

  it("hands over a dropped file", () => {
    const { onFile } = renderZone();
    const file = pdf("dropped.pdf");

    fireEvent.drop(screen.getByTestId("drop-area"), { dataTransfer: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("shows the dragging state on drag over, and warms what a file will need", () => {
    const { onWarm } = renderZone();
    const zone = screen.getByTestId("drop-area");

    expect(zone).toHaveAttribute("data-state", "idle");
    fireEvent.dragOver(zone);

    expect(zone).toHaveAttribute("data-state", "dragging");
    expect(onWarm).toHaveBeenCalled();
  });

  it("returns to idle when the drag leaves, and on drop", () => {
    renderZone();
    const zone = screen.getByTestId("drop-area");

    fireEvent.dragOver(zone);
    fireEvent.dragLeave(zone, { relatedTarget: document.body });
    expect(zone).toHaveAttribute("data-state", "idle");

    fireEvent.dragOver(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [] } });
    expect(zone).toHaveAttribute("data-state", "idle");
  });

  /**
   * jsdom has no `DragEvent`, so Testing Library's `dragLeave` falls back to a
   * plain `Event` and drops `relatedTarget`. A `MouseEvent`, which `DragEvent`
   * extends in a browser, carries it through to React.
   */
  it("stays in the dragging state when the drag moves onto one of its own children", () => {
    renderZone();
    const zone = screen.getByTestId("drop-area");

    fireEvent.dragOver(zone);
    fireEvent(
      zone,
      new MouseEvent("dragleave", {
        bubbles: true,
        relatedTarget: screen.getByRole("button", { name: "Choose a PDF" }),
      }),
    );

    expect(zone).toHaveAttribute("data-state", "dragging");
  });

  it("warms on pointer enter and on the button taking focus", async () => {
    const { onWarm } = renderZone();

    fireEvent.pointerEnter(screen.getByTestId("drop-area"));
    expect(onWarm).toHaveBeenCalledTimes(1);

    await userEvent.setup().tab();
    expect(onWarm).toHaveBeenCalledTimes(2);
  });

  it("passes axe", async () => {
    const { container } = renderZone();

    await expectNoAxeViolations(container);
  });
});
