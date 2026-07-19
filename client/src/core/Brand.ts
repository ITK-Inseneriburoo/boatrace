import * as THREE from "three";
import { trackAsset } from "./AssetLoading";

/**
 * ITK Inseneribüroo bränding: SVG-logod tekstuuridena (lipud, bännerid,
 * sildid). Kõik laadimised on best-effort — puuduv fail = lihtsalt ilma
 * logota variant.
 */

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = imgCache.get(url);
  if (!p) {
    p = trackAsset(new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    }));
    imgCache.set(url, p);
  }
  return p;
}

function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** ITK lipp: valge kangas, sinine logo, sinine äärisriba */
export async function flagTexture(): Promise<THREE.Texture | null> {
  const img = await loadImage("/brand/logo-ITK.svg");
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f6f8";
  g.fillRect(0, 0, 512, 320);
  g.fillStyle = "#0a4ea3";
  g.fillRect(0, 0, 26, 320);
  if (img) g.drawImage(img, 140, 24, 272, 272);
  return makeTexture(c);
}

/** Stardibänner: kordvad logod + tekst */
export async function bannerTexture(): Promise<THREE.Texture | null> {
  const img = await loadImage("/brand/logo-ITK-white.svg");
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0a4ea3";
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = "#ffffff";
  g.font = "700 64px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("ITK INSENERIBÜROO", 512, 66);
  if (img) {
    g.drawImage(img, 24, 16, 96, 96);
    g.drawImage(img, 1024 - 120, 16, 96, 96);
  }
  return makeTexture(c);
}

/** Laohoone silt: logo + osakonna nimi (elektri/kütte/venti/vee projekteerimine) */
export async function signTexture(text: string): Promise<THREE.Texture | null> {
  const img = await loadImage("/brand/logo-ITK.svg");
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e9ecef";
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = "#0a4ea3";
  g.fillRect(0, 218, 1024, 38);
  if (img) g.drawImage(img, 30, 28, 160, 160);
  g.fillStyle = "#12263a";
  g.font = "700 92px system-ui, sans-serif";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText("ITK", 220, 78);
  g.font = "600 58px system-ui, sans-serif";
  g.fillText(text, 220, 160);
  return makeTexture(c);
}

/** Õhupalli valge graafiline märk ilma ITK tekstita (läbipaistev taust) */
export async function balloonLogoTexture(): Promise<THREE.Texture | null> {
  const img = await loadImage("/brand/logo-ITK-white.svg");
  if (!img) return null;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.drawImage(img, 32, 32, 448, 448);
  return makeTexture(c);
}

/** Laeva küljelogo (läbipaistev taust) */
export async function shipLogoTexture(): Promise<THREE.Texture | null> {
  const img = await loadImage("/brand/logo-ITK-white.svg");
  if (!img) return null;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.drawImage(img, 8, 24, 208, 208);
  g.fillStyle = "#ffffff";
  g.font = "700 120px system-ui, sans-serif";
  g.textBaseline = "middle";
  g.fillText("ITK", 240, 132);
  return makeTexture(c);
}
