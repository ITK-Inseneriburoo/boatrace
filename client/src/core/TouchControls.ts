import type { VehicleId } from "@shared/types";
import { VEHICLES } from "@shared/vehicles";
import { Input, type TouchAction } from "./Input";
import { appleScreenRotation, isAppleMobile, isTouchDevice } from "./Platform";
import { h } from "../ui/ScreenManager";
import { t } from "../ui/i18n/et";

type TiltState = "idle" | "pending" | "active" | "fallback";
type PermissionSensorCtor = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/**
 * Mobiilse võidusõidu juhtkiht. Füüsika ei tea puuteekraanist midagi:
 * see klass normaliseerib hoovad ja nupud samasse Input olekusse.
 */
export class TouchControls {
  readonly el: HTMLElement;

  private readonly enabled = isTouchDevice();
  // iPadOS-i Euler-nurgad lähevad landscape'is ±90° juures singulaarseks.
  // Gravitatsioonivektor annab seal mõlemas suunas stabiilse roolisignaali.
  private readonly useGravitySensor = isAppleMobile();
  private readonly steerPad: HTMLElement;
  private readonly steerKnob: HTMLElement;
  private readonly gasKnob: HTMLElement;
  private readonly abilityBtn: HTMLButtonElement;
  private readonly tiltStatus: HTMLElement;
  private readonly recalibrateBtn: HTMLButtonElement;
  private readonly steerModeBtn: HTMLButtonElement;

  private tiltState: TiltState = "idle";
  private listening = false;
  private neutralTilt: number | null = null;
  private neutralGravity: number | null = null;
  private tiltSteer = 0;
  private padSteer = 0;
  private throttle = 0;
  private portrait = matchMedia("(orientation: portrait)").matches;
  private sensorTimer: number | null = null;
  private tiltRequest: Promise<void> | null = null;
  private manualSteering = false;

  constructor(private readonly input: Input) {
    this.steerKnob = h("div", { class: "touch-stick-knob" });
    this.steerPad = h(
      "div",
      { class: "touch-stick touch-steer", "aria-label": t("touch.rool") },
      h("span", { class: "touch-stick-label" }, t("touch.rool")),
      this.steerKnob,
    );

    this.gasKnob = h("div", { class: "touch-stick-knob" });
    const gasPad = h(
      "div",
      { class: "touch-stick touch-throttle", "aria-label": t("touch.gaas") },
      h("span", { class: "touch-throttle-forward" }, "+"),
      h("span", { class: "touch-stick-label" }, t("touch.gaas")),
      h("span", { class: "touch-throttle-back" }, "−"),
      this.gasKnob,
    );

    this.abilityBtn = this.holdButton(t("touch.voime"), "slide", "ability");
    const actions = h(
      "div",
      { class: "touch-actions" },
      this.holdButton(t("touch.boost"), "boost", "boost"),
      this.abilityBtn,
      this.tapButton(t("touch.tuli"), "action", "fire"),
      this.tapButton(t("touch.rajale"), "respawn", "respawn"),
    );

    this.tiltStatus = h("div", { class: "touch-tilt-status" }, t("touch.kallutusOotel"));
    this.recalibrateBtn = h(
      "button",
      {
        class: "touch-tool",
        type: "button",
        "aria-label": t("touch.kalibreeri"),
        title: t("touch.kalibreeri"),
      },
      "⟳",
    ) as HTMLButtonElement;
    this.recalibrateBtn.onpointerdown = (e) => {
      e.preventDefault();
      this.recalibrate();
    };
    this.steerModeBtn = h(
      "button",
      {
        class: "touch-tool touch-steer-mode",
        type: "button",
        "aria-label": t("touch.vahetaKasiroolile"),
        title: t("touch.vahetaKasiroolile"),
      },
      t("touch.kasitsi"),
    ) as HTMLButtonElement;
    this.steerModeBtn.onpointerdown = (event) => {
      event.preventDefault();
      this.toggleManualSteering();
    };
    const tools = h(
      "div",
      { class: "touch-tools" },
      this.tiltStatus,
      this.recalibrateBtn,
      this.steerModeBtn,
      this.tapButton("?", "legend", "tool"),
      this.tapButton("Ⅱ", "pause", "tool"),
    );

    const portrait = h(
      "div",
      { class: "touch-portrait" },
      h("div", { class: "panel" }, t("touch.poora")),
    );

    this.el = h(
      "div",
      { class: "touch-controls", "aria-hidden": this.enabled ? "false" : "true" },
      tools,
      this.steerPad,
      actions,
      gasPad,
      portrait,
    );

    this.bindAxis(this.steerPad, this.steerKnob, "x", (value) => {
      this.padSteer = value;
      this.syncAxes();
    });
    this.bindAxis(gasPad, this.gasKnob, "y", (value) => {
      this.throttle = -value;
      this.syncAxes();
    });

    window.addEventListener("resize", this.syncOrientation);
    screen.orientation?.addEventListener("change", this.onScreenOrientationChange);
    window.addEventListener("blur", () => this.resetControls());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.resetControls();
    });

    if (!this.enabled) this.el.style.display = "none";
    this.updateSteerMode();
  }

  /**
   * Kutsu otse kasutaja vajutuse call stack'ist. iPadOS ei luba
   * requestPermission() väljakutset pärast await'i või taimerit.
   */
  prepareTilt(): Promise<void> {
    if (!this.enabled || this.tiltState === "active") return Promise.resolve();
    if (this.tiltRequest) return this.tiltRequest;
    if (this.tiltState === "pending") return Promise.resolve();

    if (!window.isSecureContext && location.hostname !== "localhost") {
      this.useFallback(t("touch.vajabHttps"));
      return Promise.resolve();
    }

    const sensorAvailable = this.useGravitySensor
      ? typeof DeviceMotionEvent !== "undefined"
      : typeof DeviceOrientationEvent !== "undefined";
    if (!sensorAvailable) {
      this.useFallback(t("touch.sensorPuudub"));
      return Promise.resolve();
    }

    const ctor = (this.useGravitySensor
      ? DeviceMotionEvent
      : DeviceOrientationEvent) as unknown as PermissionSensorCtor;
    if (typeof ctor.requestPermission === "function") {
      this.tiltState = "pending";
      this.tiltStatus.textContent = t("touch.kusibLuba");
      this.tiltRequest = ctor
        .requestPermission()
        .then((result) => {
          if (result === "granted") this.startSensor();
          else this.useFallback(t("touch.lubaPuudub"));
        })
        .catch(() => this.useFallback(t("touch.lubaPuudub")))
        .finally(() => (this.tiltRequest = null));
      return this.tiltRequest;
    }

    this.startSensor();
    return Promise.resolve();
  }

  show(vehicle: VehicleId): void {
    if (!this.enabled) return;
    this.abilityBtn.textContent = VEHICLES[vehicle].abilityName;
    this.el.classList.add("active");
    this.syncOrientation();
    if (this.tiltState === "idle") void this.prepareTilt();
  }

  hide(): void {
    this.el.classList.remove("active");
    this.resetControls();
  }

  setPaused(paused: boolean): void {
    this.el.classList.toggle("paused", paused);
    if (paused) this.resetControls();
  }

  private startSensor(): void {
    this.tiltState = "pending";
    this.tiltStatus.textContent = t("touch.hoiaOtse");
    if (!this.listening) {
      if (this.useGravitySensor) window.addEventListener("devicemotion", this.onMotion);
      else window.addEventListener("deviceorientation", this.onOrientation);
      this.listening = true;
    }
    if (this.sensorTimer !== null) window.clearTimeout(this.sensorTimer);
    this.sensorTimer = window.setTimeout(() => {
      if (this.tiltState !== "active") this.useFallback(t("touch.sensorPuudub"));
    }, 1500);
  }

  private onOrientation = (event: DeviceOrientationEvent): void => {
    if (event.beta === null || event.gamma === null) return;

    const angle = screen.orientation?.angle ?? 0;
    const radians = (angle * Math.PI) / 180;
    const raw = event.gamma * Math.cos(radians) + event.beta * Math.sin(radians);

    if (this.neutralTilt === null) {
      this.neutralTilt = raw;
      this.tiltSteer = 0;
    }

    const difference = this.angleDifference(raw, this.neutralTilt);
    const magnitude = Math.abs(difference);
    const target =
      magnitude <= 3 ? 0 : Math.sign(difference) * Math.min(1, (magnitude - 3) / 17);

    this.tiltSteer += (target - this.tiltSteer) * 0.22;
    if (Math.abs(this.tiltSteer) < 0.01) this.tiltSteer = 0;

    if (this.tiltState !== "active") {
      this.tiltState = "active";
      if (this.sensorTimer !== null) window.clearTimeout(this.sensorTimer);
      this.sensorTimer = null;
      this.tiltStatus.textContent = t("touch.kallutusSees");
      this.updateSteerMode();
    }
    this.syncAxes();
  };

  private onMotion = (event: DeviceMotionEvent): void => {
    const gravity = event.accelerationIncludingGravity;
    if (gravity === null || gravity.x === null || gravity.y === null) return;

    // Pööra seadme loomulike telgede gravitatsioon screen-space x-teljeks.
    // Nii jääb märk õigeks mõlemas landscape-suunas.
    const angle = appleScreenRotation();
    const radians = (angle * Math.PI) / 180;
    const raw = gravity.x * Math.cos(radians) + gravity.y * Math.sin(radians);

    // 3° surnud ala ja täisrool 20° juures, väljendatuna gravitatsioonis.
    const deadZone = 9.81 * Math.sin((3 * Math.PI) / 180);
    const fullSignal = 9.81 * Math.sin((20 * Math.PI) / 180);

    if (this.neutralGravity === null) {
      this.neutralGravity = raw;
      this.tiltSteer = 0;
    }

    const difference = raw - this.neutralGravity;
    const magnitude = Math.abs(difference);
    const target =
      magnitude <= deadZone
        ? 0
        : Math.sign(difference) * Math.min(1, (magnitude - deadZone) / (fullSignal - deadZone));

    this.tiltSteer += (target - this.tiltSteer) * 0.22;
    if (Math.abs(this.tiltSteer) < 0.01) this.tiltSteer = 0;

    if (this.tiltState !== "active") {
      this.tiltState = "active";
      if (this.sensorTimer !== null) window.clearTimeout(this.sensorTimer);
      this.sensorTimer = null;
      this.tiltStatus.textContent = t("touch.kallutusSees");
      this.updateSteerMode();
    }
    this.syncAxes();
  };

  private angleDifference(value: number, neutral: number): number {
    let difference = value - neutral;
    while (difference > 180) difference -= 360;
    while (difference < -180) difference += 360;
    return difference;
  }

  private recalibrate(): void {
    if (this.tiltState !== "active" && this.tiltState !== "pending") {
      void this.prepareTilt();
      return;
    }
    this.neutralTilt = null;
    this.neutralGravity = null;
    this.tiltSteer = 0;
    this.tiltStatus.textContent = t("touch.hoiaOtse");
    this.syncAxes();
  }

  private useFallback(message: string): void {
    this.tiltState = "fallback";
    this.manualSteering = true;
    this.neutralTilt = null;
    this.neutralGravity = null;
    this.tiltSteer = 0;
    this.tiltStatus.textContent = message;
    this.updateSteerMode();
    this.syncAxes();
  }

  private updateSteerMode(): void {
    const fallback = this.manualSteering || this.tiltState !== "active";
    this.el.classList.toggle("fallback-steer", fallback);
    this.recalibrateBtn.disabled = this.manualSteering;
    this.recalibrateBtn.classList.toggle(
      "warning",
      this.tiltState === "fallback" && !this.manualSteering,
    );

    const switchLabel = this.manualSteering
      ? t("touch.vahetaKallutusele")
      : t("touch.vahetaKasiroolile");
    this.steerModeBtn.textContent = this.manualSteering
      ? t("touch.kalluta")
      : t("touch.kasitsi");
    this.steerModeBtn.setAttribute("aria-label", switchLabel);
    this.steerModeBtn.title = switchLabel;
    this.steerModeBtn.classList.toggle("selected", this.manualSteering);
  }

  private toggleManualSteering(): void {
    this.manualSteering = !this.manualSteering;
    this.padSteer = 0;
    this.tiltSteer = 0;
    this.steerKnob.style.transform = "";

    if (this.manualSteering) {
      this.tiltStatus.textContent = t("touch.kasiroolSees");
    } else {
      this.neutralTilt = null;
      this.neutralGravity = null;
      if (this.tiltState === "active") {
        this.tiltStatus.textContent = t("touch.hoiaOtse");
      } else {
        void this.prepareTilt();
      }
    }
    this.updateSteerMode();
    this.syncAxes();
  }

  private onScreenOrientationChange = (): void => {
    this.neutralTilt = null;
    this.neutralGravity = null;
    this.tiltSteer = 0;
    if (this.tiltState === "active" && !this.manualSteering) {
      this.tiltStatus.textContent = t("touch.hoiaOtse");
    }
    this.syncOrientation();
    this.syncAxes();
  };

  private syncOrientation = (): void => {
    this.portrait = matchMedia("(orientation: portrait)").matches;
    this.el.classList.toggle("portrait", this.portrait);
    if (this.portrait) this.resetControls();
  };

  private syncAxes(): void {
    const useTilt = this.tiltState === "active" && !this.manualSteering;
    const steer = useTilt ? this.tiltSteer : this.padSteer;
    this.input.setTouchAxes(this.portrait ? 0 : this.throttle, this.portrait ? 0 : steer);
  }

  private resetControls(): void {
    this.throttle = 0;
    this.padSteer = 0;
    this.tiltSteer = 0;
    this.input.resetTouch();
    this.gasKnob.style.transform = "";
    this.steerKnob.style.transform = "";
    for (const active of this.el.querySelectorAll(".pressed")) active.classList.remove("pressed");
  }

  private bindAxis(
    zone: HTMLElement,
    knob: HTMLElement,
    axis: "x" | "y",
    onValue: (value: number) => void,
  ): void {
    let pointerId: number | null = null;

    const update = (event: PointerEvent): void => {
      const rect = zone.getBoundingClientRect();
      const center = axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
      const coordinate = axis === "x" ? event.clientX : event.clientY;
      const radius = (axis === "x" ? rect.width : rect.height) * 0.36;
      const value = Math.max(-1, Math.min(1, (coordinate - center) / radius));
      onValue(value);
      const distance = value * radius;
      knob.style.transform =
        axis === "x" ? "translate3d(" + distance + "px,0,0)" : "translate3d(0," + distance + "px,0)";
    };

    zone.onpointerdown = (event) => {
      if (pointerId !== null || this.portrait) return;
      event.preventDefault();
      pointerId = event.pointerId;
      zone.setPointerCapture(pointerId);
      zone.classList.add("pressed");
      update(event);
    };
    zone.onpointermove = (event) => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      update(event);
    };
    const release = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      zone.classList.remove("pressed");
      knob.style.transform = "";
      onValue(0);
    };
    zone.onpointerup = release;
    zone.onpointercancel = release;
    zone.onlostpointercapture = release;
  }

  private holdButton(
    label: string,
    inputButton: "slide" | "boost",
    variant: string,
  ): HTMLButtonElement {
    const button = h(
      "button",
      { class: "touch-action touch-" + variant, type: "button" },
      label,
    ) as HTMLButtonElement;
    const set = (pressed: boolean): void => {
      button.classList.toggle("pressed", pressed);
      this.input.setTouchButton(inputButton, pressed && !this.portrait);
    };
    button.onpointerdown = (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      set(true);
    };
    button.onpointerup = () => set(false);
    button.onpointercancel = () => set(false);
    button.onlostpointercapture = () => set(false);
    return button;
  }

  private tapButton(label: string, action: TouchAction, variant: string): HTMLButtonElement {
    const button = h(
      "button",
      { class: "touch-action touch-" + variant, type: "button" },
      label,
    ) as HTMLButtonElement;
    button.onpointerdown = (event) => {
      event.preventDefault();
      if (this.portrait) return;
      button.classList.add("pressed");
      this.input.triggerTouchAction(action);
    };
    const release = (): void => button.classList.remove("pressed");
    button.onpointerup = release;
    button.onpointercancel = release;
    button.onpointerleave = release;
    return button;
  }
}
