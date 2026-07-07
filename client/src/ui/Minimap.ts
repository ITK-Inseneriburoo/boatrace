import type { TrackWorld } from "../world/TrackBuilder";

const SIZE = 150;

export interface MinimapDot {
  x: number;
  z: number;
  yaw: number;
  color: string;
  me: boolean;
}

/** 2D minimap: rajajoon eelrenderdatud, punktid iga kaadri kohta */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private scale = 1;
  private cx = 0;
  private cz = 0;

  constructor(track: TrackWorld) {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "minimap";
    this.canvas.width = SIZE * 2;
    this.canvas.height = SIZE * 2;
    this.canvas.style.width = `${SIZE}px`;
    this.canvas.style.height = `${SIZE}px`;
    this.ctx = this.canvas.getContext("2d")!;

    // Rajajoone bbox
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of track.polyline) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y);
      maxZ = Math.max(maxZ, p.y);
    }
    const pad = 30;
    const w = maxX - minX + pad * 2;
    const hgt = maxZ - minZ + pad * 2;
    this.scale = (SIZE * 2) / Math.max(w, hgt);
    this.cx = (minX + maxX) / 2;
    this.cz = (minZ + maxZ) / 2;

    // Eelrenderda rada
    this.bg = document.createElement("canvas");
    this.bg.width = SIZE * 2;
    this.bg.height = SIZE * 2;
    const b = this.bg.getContext("2d")!;
    b.strokeStyle = "rgba(255,255,255,0.55)";
    b.lineWidth = 5;
    b.lineJoin = "round";
    b.beginPath();
    track.polyline.forEach((p, i) => {
      const [x, y] = this.toMap(p.x, p.y);
      if (i === 0) b.moveTo(x, y);
      else b.lineTo(x, y);
    });
    b.closePath();
    b.stroke();
    // Stardijoon
    const g0 = track.gates[0];
    b.strokeStyle = "#ffe45e";
    b.lineWidth = 4;
    b.beginPath();
    const [lx, ly] = this.toMap(g0.left.x, g0.left.y);
    const [rx, ry] = this.toMap(g0.right.x, g0.right.y);
    b.moveTo(lx, ly);
    b.lineTo(rx, ry);
    b.stroke();
  }

  private toMap(x: number, z: number): [number, number] {
    return [SIZE + (x - this.cx) * this.scale, SIZE + (z - this.cz) * this.scale];
  }

  render(dots: MinimapDot[]): void {
    const c = this.ctx;
    c.clearRect(0, 0, SIZE * 2, SIZE * 2);
    c.drawImage(this.bg, 0, 0);
    for (const d of dots) {
      const [x, y] = this.toMap(d.x, d.z);
      c.save();
      c.translate(x, y);
      if (d.me) {
        // Maailma +Z on kaardil alla → nool üles = yaw π
        c.rotate(Math.PI - d.yaw);
        c.beginPath();
        c.moveTo(0, -8);
        c.lineTo(5.5, 6);
        c.lineTo(-5.5, 6);
        c.closePath();
        c.fillStyle = d.color;
        c.fill();
        c.strokeStyle = "rgba(0,0,0,0.5)";
        c.lineWidth = 1.5;
        c.stroke();
      } else {
        c.fillStyle = d.color;
        c.beginPath();
        c.arc(0, 0, 5, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
  }
}
