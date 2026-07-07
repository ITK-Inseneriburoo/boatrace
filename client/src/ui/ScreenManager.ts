export interface Screen {
  /** ekraani juurelement (lisatakse #ui alla) */
  readonly el: HTMLElement;
  onShow?(): void;
  onHide?(): void;
}

/** Näitab korraga täpselt ühte ekraani; HUD on eraldi (mitte ekraan) */
export class ScreenManager {
  private current: Screen | null = null;

  constructor(private root: HTMLElement) {}

  register(screen: Screen): void {
    screen.el.classList.add("screen");
    this.root.appendChild(screen.el);
  }

  show(screen: Screen | null): void {
    if (this.current === screen) return;
    if (this.current) {
      this.current.el.classList.remove("active");
      this.current.onHide?.();
    }
    this.current = screen;
    if (screen) {
      screen.el.classList.add("active");
      screen.onShow?.();
    }
  }
}

/** Abifunktsioon elementide loomiseks */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (HTMLElement | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}
