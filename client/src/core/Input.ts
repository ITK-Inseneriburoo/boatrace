/**
 * Klaviatuur (WASD + nooled) ja gamepad.
 * throttle ∈ [-1,1], steer ∈ [-1,1] (-1 = vasakule), slide = triivinupp.
 */
export class Input {
  private keys = new Set<string>();
  private justPressed = new Set<string>();

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  /** Kutsu üks kord kaadri lõpus */
  endFrame(): void {
    this.justPressed.clear();
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
    const gp = this.gamepad();
    if (gp) {
      const x = gp.axes[0] ?? 0;
      if (Math.abs(x) > 0.12) s = x;
    }
    return s;
  }

  get slide(): boolean {
    const gp = this.gamepad();
    return this.keys.has("ShiftLeft") || this.keys.has("Space") || !!gp?.buttons[0]?.pressed;
  }

  get respawnPressed(): boolean {
    return this.justPressed.has("KeyR");
  }
}
