export interface TouchInputState {
  throttle: number;
  steer: number;
  slide: boolean;
  boost: boolean;
}

export type TouchAction = "respawn" | "action" | "pause" | "legend";

/**
 * Klaviatuur (WASD + nooled), gamepad ja puutejuhtimine.
 * throttle ∈ [-1,1], steer ∈ [-1,1] (-1 = vasakule), ability = sõidukivõime.
 */
export class Input {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private touchJustPressed = new Set<TouchAction>();
  private touch: TouchInputState = { throttle: 0, steer: 0, slide: false, boost: false };

  constructor() {
    window.addEventListener("keydown", (e) => {
      // Tab on vaatleja kaameravahetus — ära lase fookusel rännata
      if (e.code === "Tab") e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
  }

  /** Kutsu üks kord kaadri lõpus */
  endFrame(): void {
    this.justPressed.clear();
    this.touchJustPressed.clear();
  }

  setTouchAxes(throttle: number, steer: number): void {
    this.touch.throttle = Math.max(-1, Math.min(1, throttle));
    this.touch.steer = Math.max(-1, Math.min(1, steer));
  }

  setTouchButton(button: "slide" | "boost", pressed: boolean): void {
    this.touch[button] = pressed;
  }

  triggerTouchAction(action: TouchAction): void {
    this.touchJustPressed.add(action);
  }

  resetTouch(): void {
    this.touch = { throttle: 0, steer: 0, slide: false, boost: false };
  }

  private reset(): void {
    this.keys.clear();
    this.justPressed.clear();
    this.touchJustPressed.clear();
    this.resetTouch();
  }

  wasPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  private gamepad(): Gamepad | null {
    for (const gp of navigator.getGamepads()) {
      if (gp && gp.connected) return gp;
    }
    return null;
  }

  get throttle(): number {
    let t = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) t += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) t -= 1;
    if (Math.abs(this.touch.throttle) > Math.abs(t)) t = this.touch.throttle;
    const gp = this.gamepad();
    if (gp) {
      const fwd = gp.buttons[7]?.value ?? 0; // RT
      const back = gp.buttons[6]?.value ?? 0; // LT
      if (fwd > 0.05 || back > 0.05) t = fwd - back;
    }
    return t;
  }

  get steer(): number {
    let s = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) s -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) s += 1;
    if (Math.abs(this.touch.steer) > Math.abs(s)) s = this.touch.steer;
    const gp = this.gamepad();
    if (gp) {
      const x = gp.axes[0] ?? 0;
      if (Math.abs(x) > 0.12) s = x;
    }
    return s;
  }

  get slide(): boolean {
    const gp = this.gamepad();
    return (
      this.touch.slide ||
      this.keys.has("ShiftLeft") ||
      this.keys.has("ShiftRight") ||
      !!gp?.buttons[0]?.pressed
    );
  }

  /** Boost — hoia all lühiajaliseks kiiruslisaks (Ctrl või gamepadi B/RB) */
  get boost(): boolean {
    const gp = this.gamepad();
    return (
      this.keys.has("ControlLeft") ||
      this.keys.has("ControlRight") ||
      this.touch.boost ||
      !!gp?.buttons[1]?.pressed || // B / ○
      !!gp?.buttons[5]?.pressed // RB
    );
  }

  get respawnPressed(): boolean {
    return this.justPressed.has("KeyR") || this.touchJustPressed.has("respawn");
  }

  get actionPressed(): boolean {
    const gp = this.gamepad();
    return (
      this.justPressed.has("Space") ||
      this.touchJustPressed.has("action") ||
      !!gp?.buttons[2]?.pressed
    );
  }

  get pausePressed(): boolean {
    return this.justPressed.has("Escape") || this.touchJustPressed.has("pause");
  }

  get legendPressed(): boolean {
    return this.justPressed.has("KeyH") || this.touchJustPressed.has("legend");
  }
}
