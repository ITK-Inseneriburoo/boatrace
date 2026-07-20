import type { Input } from "../core/Input";

type Direction = "up" | "down" | "left" | "right";

const FOCUSABLE = "button, input, select, summary, .chip, .swatch, .vehicle-card";

/** Lihtne ruumiline navigeerimine DOM-menüüdes standardse gamepadiga. */
export class GamepadNavigation {
  private root: HTMLElement | null = null;
  private focused: HTMLElement | null = null;

  update(root: HTMLElement | null, input: Input): void {
    if (root !== this.root) {
      this.clearFocus();
      this.root = root;
      if (root && input.hasGamepad) this.focusDefault(root);
    }
    if (!root || !input.hasGamepad) return;

    const direction = this.direction(input);
    if (direction) this.move(root, direction);

    if (input.gamepadConfirmPressed) {
      const target = this.current(root) ?? this.focusDefault(root);
      target?.click();
    }
  }

  clear(): void {
    this.clearFocus();
    this.root = null;
  }

  private direction(input: Input): Direction | null {
    if (input.gamepadUiUpPressed) return "up";
    if (input.gamepadUiDownPressed) return "down";
    if (input.gamepadUiLeftPressed) return "left";
    if (input.gamepadUiRightPressed) return "right";
    return null;
  }

  private move(root: HTMLElement, direction: Direction): void {
    const items = this.items(root);
    if (!items.length) return;
    const current = this.current(root);
    if (!current) {
      this.focusDefault(root);
      return;
    }

    const from = center(current.getBoundingClientRect());
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const candidate of items) {
      if (candidate === current) continue;
      const to = center(candidate.getBoundingClientRect());
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const primary =
        direction === "left" ? -dx : direction === "right" ? dx : direction === "up" ? -dy : dy;
      if (primary <= 3) continue;
      const cross = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
      const score = primary + cross * 2.4 + (cross * cross) / (primary + 1);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best) this.focus(best);
  }

  private focusDefault(root: HTMLElement): HTMLElement | null {
    const items = this.items(root);
    const target =
      items.find((item) => item.matches("button.primary:not(:disabled)")) ??
      items.find((item) => item.classList.contains("selected")) ??
      items[0] ??
      null;
    if (target) this.focus(target);
    return target;
  }

  private current(root: HTMLElement): HTMLElement | null {
    if (this.focused?.isConnected && root.contains(this.focused) && this.isUsable(this.focused)) {
      return this.focused;
    }
    this.clearFocus();
    return null;
  }

  private items(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => this.isUsable(item));
  }

  private isUsable(item: HTMLElement): boolean {
    if (
      (item instanceof HTMLButtonElement ||
        item instanceof HTMLInputElement ||
        item instanceof HTMLSelectElement) &&
      item.disabled
    ) {
      return false;
    }
    if (
      item.matches(".chip, .swatch, .vehicle-card") &&
      typeof item.onclick !== "function"
    ) {
      return false;
    }
    const style = getComputedStyle(item);
    return style.display !== "none" && style.visibility !== "hidden" && item.getClientRects().length > 0;
  }

  private focus(item: HTMLElement): void {
    this.clearFocus();
    this.focused = item;
    if (!item.matches("button, input, select, summary")) item.tabIndex = -1;
    item.classList.add("gamepad-focus");
    item.focus({ preventScroll: true });
    item.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  private clearFocus(): void {
    this.focused?.classList.remove("gamepad-focus");
    this.focused = null;
  }
}

function center(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
