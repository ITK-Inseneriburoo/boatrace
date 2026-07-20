export interface TouchInputState {
  throttle: number;
  steer: number;
  slide: boolean;
  boost: boolean;
}

export type TouchAction = "respawn" | "action" | "pause" | "legend";

/**
 * Kõik klahvid, mida mäng sõidu ajal kasutab. Nende vaikekäitumine tuleb
 * peatada, et nt Ctrl+W, Ctrl+R, Alt+nooleklahv, tühik ja Tab ei annaks
 * juhtimist brauserile üle.
 */
const GAMEPLAY_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "Space",
  "KeyR",
  "Escape",
  "KeyH",
  "KeyQ",
  "KeyE",
  "Tab",
]);

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * Klaviatuur (WASD + nooled), gamepad ja puutejuhtimine.
 * throttle ∈ [-1,1], steer ∈ [-1,1] (-1 = vasakule), ability = sõidukivõime.
 */
export class Input {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private touchJustPressed = new Set<TouchAction>();
  private touch: TouchInputState = { throttle: 0, steer: 0, slide: false, boost: false };
  private gameplayActive = false;
  private gamepadConnected = false;
  private gamepadButtons: boolean[] = [];
  private gamepadButtonValues: number[] = [];
  private gamepadJustPressed = new Set<number>();
  private gamepadJustActivated = false;
  private gamepadAxes: number[] = [];
  private previousGamepadAxes: number[] = [];

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (!this.gameplayActive || isTextEntry(e.target) || !GAMEPLAY_KEYS.has(e.code)) return;
      e.preventDefault();
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

  /** Püüa mänguklahvid kinni ainult loenduse ja aktiivse sõidu ajal. */
  setGameplayActive(active: boolean): void {
    if (this.gameplayActive === active) return;
    this.gameplayActive = active;
    this.reset();
  }

  /** Loe Gamepad API olek ühe korra simulatsioonisammu alguses. */
  beginUpdate(): void {
    const previousButtons = this.gamepadButtons;
    this.previousGamepadAxes = this.gamepadAxes;
    this.gamepadJustActivated = false;

    const gp = this.firstGamepad();
    this.gamepadConnected = gp !== null;
    this.gamepadButtons = gp?.buttons.map((button) => button.pressed) ?? [];
    this.gamepadButtonValues = gp?.buttons.map((button) => button.value) ?? [];
    this.gamepadAxes = gp ? [...gp.axes] : [];

    for (let i = 0; i < this.gamepadButtons.length; i++) {
      if (this.gamepadButtons[i] && !previousButtons[i]) {
        this.gamepadJustPressed.add(i);
        this.gamepadJustActivated = true;
      }
    }
    for (let i = 0; i < this.gamepadAxes.length; i++) {
      if (
        Math.abs(this.gamepadAxes[i] ?? 0) > 0.55 &&
        Math.abs(this.previousGamepadAxes[i] ?? 0) <= 0.55
      ) {
        this.gamepadJustActivated = true;
      }
    }
  }

  /** Kutsu pärast iga simulatsioonisammu, et hetkeline sisend loetaks täpselt ühe korra. */
  endUpdate(): void {
    this.justPressed.clear();
    this.touchJustPressed.clear();
    this.gamepadJustPressed.clear();
    this.gamepadJustActivated = false;
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
    this.gamepadJustPressed.clear();
    this.gamepadJustActivated = false;
    this.resetTouch();
  }

  wasPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  private firstGamepad(): Gamepad | null {
    for (const gp of navigator.getGamepads()) {
      if (gp && gp.connected) return gp;
    }
    return null;
  }

  private gamepadButtonDown(index: number): boolean {
    return this.gamepadButtons[index] ?? false;
  }

  private gamepadButtonPressed(index: number): boolean {
    return this.gamepadJustPressed.has(index);
  }

  private gamepadAxisPressed(index: number, direction: -1 | 1): boolean {
    return (
      (this.gamepadAxes[index] ?? 0) * direction > 0.65 &&
      (this.previousGamepadAxes[index] ?? 0) * direction <= 0.65
    );
  }

  private gamepadAxis(index: number, deadzone = 0.12): number {
    const value = this.gamepadAxes[index] ?? 0;
    return Math.abs(value) > deadzone ? value : 0;
  }

  get hasGamepad(): boolean {
    return this.gamepadConnected;
  }

  /** Esimene uus puldinupp või märgatav kepiliigutus sellel simulatsioonisammul. */
  get gamepadActivated(): boolean {
    return this.gamepadJustActivated;
  }

  get throttle(): number {
    let t = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) t += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) t -= 1;
    if (Math.abs(this.touch.throttle) > Math.abs(t)) t = this.touch.throttle;
    if (this.gamepadConnected) {
      const fwd = this.gamepadButtonValues[7] ?? 0; // RT
      const back = this.gamepadButtonValues[6] ?? 0; // LT
      if (fwd > 0.05 || back > 0.05) t = fwd - back;
    }
    return t;
  }

  get steer(): number {
    let s = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) s -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) s += 1;
    if (Math.abs(this.touch.steer) > Math.abs(s)) s = this.touch.steer;
    if (this.gamepadConnected) {
      const x = this.gamepadAxis(0);
      if (Math.abs(x) > 0.12) s = x;
    }
    return s;
  }

  get slide(): boolean {
    return (
      this.touch.slide ||
      this.keys.has("ShiftLeft") ||
      this.keys.has("ShiftRight") ||
      this.gamepadButtonDown(0) // A
    );
  }

  /** Boost — hoia all lühiajaliseks kiiruslisaks (Ctrl või gamepadi B/RB) */
  get boost(): boolean {
    return (
      this.keys.has("ControlLeft") ||
      this.keys.has("ControlRight") ||
      this.touch.boost ||
      this.gamepadButtonDown(1) || // B / ○
      this.gamepadButtonDown(5) // RB
    );
  }

  get respawnPressed(): boolean {
    return (
      this.justPressed.has("KeyR") ||
      this.touchJustPressed.has("respawn") ||
      this.gamepadButtonPressed(3) // Y / △
    );
  }

  get actionPressed(): boolean {
    return (
      this.justPressed.has("Space") ||
      this.touchJustPressed.has("action") ||
      this.gamepadButtonPressed(2) // X / □
    );
  }

  get pausePressed(): boolean {
    return (
      this.justPressed.has("Escape") ||
      this.touchJustPressed.has("pause") ||
      this.gamepadButtonPressed(9) // Menu / Options
    );
  }

  get legendPressed(): boolean {
    return (
      this.justPressed.has("KeyH") ||
      this.touchJustPressed.has("legend") ||
      this.gamepadButtonPressed(8) // View / Create
    );
  }

  get gamepadConfirmPressed(): boolean {
    return this.gamepadButtonPressed(0); // A / ×
  }

  get gamepadCancelPressed(): boolean {
    return this.gamepadButtonPressed(1); // B / ○
  }

  get gamepadUiUpPressed(): boolean {
    return this.gamepadButtonPressed(12) || this.gamepadAxisPressed(1, -1);
  }

  get gamepadUiDownPressed(): boolean {
    return this.gamepadButtonPressed(13) || this.gamepadAxisPressed(1, 1);
  }

  get gamepadUiLeftPressed(): boolean {
    return this.gamepadButtonPressed(14) || this.gamepadAxisPressed(0, -1);
  }

  get gamepadUiRightPressed(): boolean {
    return this.gamepadButtonPressed(15) || this.gamepadAxisPressed(0, 1);
  }

  /** Vaatlejakaamera liikumine: vasak kepp või D-pad. */
  get gamepadMoveX(): number {
    const dpad = Number(this.gamepadButtonDown(15)) - Number(this.gamepadButtonDown(14));
    return dpad || this.gamepadAxis(0);
  }

  get gamepadMoveY(): number {
    const dpad = Number(this.gamepadButtonDown(13)) - Number(this.gamepadButtonDown(12));
    return dpad || this.gamepadAxis(1);
  }

  /** Vaatlejakaamera kõrgus: parema kepi vertikaaltelg. */
  get gamepadLookY(): number {
    return this.gamepadAxis(3);
  }

  get spectatorCyclePressed(): boolean {
    return this.gamepadButtonPressed(0); // A / ×
  }
}
