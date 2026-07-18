# Assetite päritolu ja litsentsid

Allalaadimine: `scripts/fetch-assets.sh` (HDRI-d + tekstuurid). Sõidukimudelid
laaditakse Sketchfabist käsitsi (vajab tasuta kontot) ja optimeeritakse
`npx @gltf-transform/cli optimize` abil.

## HDRI-d — Poly Haven, CC0

| Fail | Allikas |
|---|---|
| `env/kloofendal_48d_partly_cloudy_puresky_{1k,2k}.hdr` | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky |
| `env/syferfontein_0d_clear_puresky_1k.hdr` | https://polyhaven.com/a/syferfontein_0d_clear_puresky |
| `env/venice_sunset_1k.hdr` | https://polyhaven.com/a/venice_sunset |

## PBR-tekstuurid — ambientCG, CC0 (webp-ks pakitud, `_NormalGL` variant)

| Failid | ambientCG ID |
|---|---|
| `textures/terrain/sand_*` | Ground054 — https://ambientcg.com/view?id=Ground054 |
| `textures/terrain/grass_*` | Grass001 — https://ambientcg.com/view?id=Grass001 |
| `textures/terrain/rock_*` | Rock030 — https://ambientcg.com/view?id=Rock030 |
| `textures/harbor/concrete_*` | Concrete034 — https://ambientcg.com/view?id=Concrete034 |
| `textures/harbor/planks_*` | Planks012 — https://ambientcg.com/view?id=Planks012 |
| `textures/harbor/metal_*` | Metal032 — https://ambientcg.com/view?id=Metal032 |
| `textures/harbor/rust_*` | Rust004 — https://ambientcg.com/view?id=Rust004 |
| `textures/water/foam_*` | Foam003 — https://ambientcg.com/view?id=Foam003 |

## Muu

| Fail | Allikas | Litsents |
|---|---|---|
| `textures/water/waternormals.webp` | three.js repo `examples/textures/waternormals.jpg` | MIT |
| `models/*.glb` (Kenney Watercraft Kit) + `models/Textures/colormap.png` | https://kenney.nl/assets/watercraft-kit | CC0 (vt `models/License.txt`) |

## Sõidukimudelid — Sketchfab, CC Attribution (BY)

CC-BY nõuab autorile viitamist — see tabel ON see viide; hoia ajakohasena.

| Fail | Mudel | Autor | Link |
|---|---|---|---|
| `models/jetski-sport.glb` | JetSki Kawasaki SX-R | MarlenaBeyer | https://sketchfab.com/3d-models/6d16d108a53d4e4e893f7aff0b1fb822 |
| `models/jetski-regular.glb` | Kawasaki 310X Ultra Jet Ski | XOIAL | https://sketchfab.com/3d-models/37a2348f02da472d98310fd5621307c6 |
| `models/boat-riva.glb` | Riva aquarama lamborghini | Anton Kovalev | https://sketchfab.com/3d-models/9d5716a2ab6645b9a1452f1d6b0372ef |
| `models/boat-speed.glb` | Speedboat | ПГГПУ | https://sketchfab.com/3d-models/9916bd4433024202ab84e43426fc2139 |
| `models/boat-fishing.glb` | Fisher boat | Batuhan13 | https://sketchfab.com/3d-models/385b039e95754dca8d8c045ed0c515cf |

Mängusisene viide: autorid on loetletud ka menüü "Info" sektsioonis (kui olemas).
