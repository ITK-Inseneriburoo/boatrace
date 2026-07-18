#!/usr/bin/env bash
# Laeb alla CC0 graafika-assetid (Poly Haven HDRI-d, ambientCG PBR-tekstuurid,
# three.js vee-normalmap). Idempotentne: olemasolevaid faile ei laeta uuesti.
# Sketchfabi sõidukimudelid vajavad kontoga sisselogimist — vt client/public/ATTRIBUTION.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUB="$ROOT/client/public"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$PUB/env" "$PUB/textures/terrain" "$PUB/textures/water" \
  "$PUB/textures/harbor" "$PUB/models/props"

fetch() { # fetch <url> <sihtfail>
  local url="$1" out="$2"
  if [ -s "$out" ]; then echo "OLEMAS  ${out#"$PUB"/}"; return; fi
  echo "LAEN    ${out#"$PUB"/}"
  curl -fsSL --retry 3 -o "$out" "$url"
}

# --- HDRI-d (Poly Haven, CC0) ------------------------------------------------
PH="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr"
fetch "$PH/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr" "$PUB/env/kloofendal_48d_partly_cloudy_puresky_1k.hdr"
fetch "$PH/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr" "$PUB/env/kloofendal_48d_partly_cloudy_puresky_2k.hdr"
fetch "$PH/1k/syferfontein_0d_clear_puresky_1k.hdr"        "$PUB/env/syferfontein_0d_clear_puresky_1k.hdr"
fetch "$PH/1k/venice_sunset_1k.hdr"                        "$PUB/env/venice_sunset_1k.hdr"

# --- Vee detail-normalmap (three.js repo, MIT) -------------------------------
if [ ! -s "$PUB/textures/water/waternormals.webp" ]; then
  fetch "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/waternormals.jpg" \
    "$PUB/textures/water/waternormals.jpg"
fi

# --- ambientCG PBR-setid (CC0) ----------------------------------------------
# pbr <ambientCG-ID> <res: 1K|2K> <sihtkaust> <nimi>
# Zipist võetakse Color / NormalGL / Roughness (+AO kui olemas), ülejäänu visatakse ära.
pbr() {
  local id="$1" res="$2" dir="$3" name="$4"
  local lres; lres="$(echo "$res" | tr '[:upper:]' '[:lower:]')"
  local color="$dir/${name}_${lres}_color.jpg"
  # webp = juba alla laetud ja compress-textures.mjs'iga pakitud
  if [ -s "$color" ] || [ -s "${color%.jpg}.webp" ]; then echo "OLEMAS  ${color#"$PUB"/} (sett)"; return; fi
  echo "LAEN    $id ($res) -> ${dir#"$PUB"/}/${name}_${lres}_*"
  local zip="$TMP/$id-$res.zip"
  curl -fsSL --retry 3 -o "$zip" "https://ambientcg.com/get?file=${id}_${res}-JPG.zip"
  local ex="$TMP/$id-$res"
  mkdir -p "$ex"
  unzip -oq "$zip" -d "$ex"
  cp "$ex/${id}_${res}-JPG_Color.jpg"     "$color"
  cp "$ex/${id}_${res}-JPG_NormalGL.jpg"  "$dir/${name}_${lres}_normal.jpg"
  cp "$ex/${id}_${res}-JPG_Roughness.jpg" "$dir/${name}_${lres}_rough.jpg"
  if [ -f "$ex/${id}_${res}-JPG_AmbientOcclusion.jpg" ]; then
    cp "$ex/${id}_${res}-JPG_AmbientOcclusion.jpg" "$dir/${name}_${lres}_ao.jpg"
  fi
}

# Maastik: 1K kõigile, 2K korge/ultra astmele
for res in 1K 2K; do
  pbr Ground054 "$res" "$PUB/textures/terrain" sand
  pbr Grass001  "$res" "$PUB/textures/terrain" grass
  pbr Rock030   "$res" "$PUB/textures/terrain" rock
done

# Sadam: 1K piisab
pbr Concrete034 1K "$PUB/textures/harbor" concrete
pbr Planks012   1K "$PUB/textures/harbor" planks
pbr Metal032    1K "$PUB/textures/harbor" metal
pbr Rust004     1K "$PUB/textures/harbor" rust

# Vesi: vahutekstuur (ainult color-kanal on vajalik)
pbr Foam003 1K "$PUB/textures/water" foam

# --- Käsitsi laaditavad mudelid ----------------------------------------------
# Sketchfab (vajab tasuta kontot; litsentsid ja lingid: client/public/ATTRIBUTION.md):
#   jetski-sport.glb, jetski-regular.glb, boat-riva.glb, boat-speed.glb, boat-fishing.glb
#   Optimeeri: npx @gltf-transform/cli optimize sisse.glb valja.glb
# Quaternius/Kenney mänd (CC0): salvesta models/props/pine.glb (Vegetation kasutab automaatselt)
if [ ! -s "$PUB/models/props/pine.glb" ]; then
  echo "MÄRKUS: models/props/pine.glb puudub — puud jäävad protseduuriliseks (vt ATTRIBUTION.md)"
fi

# --- JPG -> webp pakkimine (vajab sharp'i; vahele jäetav kui pole) -----------
if ls "$PUB"/textures/*/*.jpg >/dev/null 2>&1; then
  if node -e "require('sharp')" 2>/dev/null; then
    node "$ROOT/scripts/compress-textures.mjs"
  else
    echo "MÄRKUS: sharp puudub — jooksuta hiljem: npm i sharp && node scripts/compress-textures.mjs"
  fi
fi

echo
echo "Valmis. Kogumaht:"
du -sh "$PUB/env" "$PUB/textures"
