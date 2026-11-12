// A dialog in the middle of the page for a closer look at something from the model panel (a map,
// a screenshot): Esc, ✕ or a click outside it closes it.

let bound = false;

/** Opens the viewer with `body`; `actions` are buttons for its title bar. */
export function openViewer(title: string, body: HTMLElement, actions: HTMLElement[] = []): void {
  const dialog = document.getElementById("viewer") as HTMLDialogElement;
  if (!bound) {
    bound = true;
    document.getElementById("viewer-close")!.addEventListener("click", () => dialog.close());
    // A click on the backdrop lands on the dialog itself.
    dialog.addEventListener("click", (ev) => ev.target === dialog && dialog.close());
  }
  document.getElementById("viewer-title")!.textContent = title;
  document.getElementById("viewer-actions")!.replaceChildren(...actions);
  document.getElementById("viewer-body")!.replaceChildren(body);
  if (!dialog.open) dialog.showModal();
}

/** The largest whole-number scale at which a w×h picture fits the viewer. */
export function fitScale(w: number, h: number, max = 24): number {
  const room = Math.min((window.innerWidth * 0.92 - 48) / w, (window.innerHeight * 0.88 - 140) / h);
  return Math.max(1, Math.min(max, Math.floor(room)));
}
