# 🚤 Boatrace — paadivõidusõit

Ettevõttesisene brauseripõhine 3D paadivõidusõidu mäng. Three.js graafika,
Node.js multiplayer-server, täielikult protseduuriline sisu (null välist
faili — ka helid on sünteesitud).

## Võimalused

- **4 rada**: Saarestik (männisaared ja kanalid), Sadamalinn (tööstussadam —
  portaalkraanad, konteineriterminal, kaubalaevad, laohooned, muulid),
  Jõekanjon (kitsas kanjon hoovuse ja kaljudega), Fjord (lumised
  kaljuseinad ja viis hüpperampi)
- **3 ilma**: päikseline, torm (vihm, välk, suured lained), udune õhtu
- **5 sõidukit**: Kiirpaat, Võidusõidukaater, Kalapaat, Jett, Sportjett —
  igaühel oma kiirus, kiirendus ja triivikäitumine
- **Hüpperambid**, kontrollpunktiväravad poide vahel, kivid/palgid,
  sadamarajatised, vale suuna hoiatus, R-klahviga respawn
- **Multiplayer**: võistlustoad kuni 8 mängijale, sünkroonne start,
  live-edetabel, serveripoolne aja- ja tulemuste arvestus, chat,
  reconnect 60 s jooksul
- **Vaatleja-režiim**: liitu toaga (või käimasoleva sõiduga) vaatlejana —
  vaba pealtvaate-kaamera (WASD, Q/E kõrgus) või järgne paatidele (Tab)
- **Kummituspaat**: soolosõidus kordab su parim ring poolläbipaistva
  paadina — võistle iseendaga (salvestub raja kaupa brauserisse)
- **Heli**: sünteesitud mootorihelid (dopleriga kaugpaatidel), pritsmed,
  väravakellad, kõuemürin, ilmapõhine taust (tuul/vihm/kajakad)
- **Mudelid**: Kenney watercraft kit (CC0) paadid/laevad/konteinerid/
  finišikaar, protseduuriline varuvariant kui failid puuduvad
- Eestikeelne kasutajaliides, ITK Inseneribüroo bränding (lipud, bännerid,
  laosildid), juhtimisklahvide legend (menüüs ja sõidus H-klahviga)

## Juhtimine

| Klahv | Tegevus |
|---|---|
| W / ↑ | gaas |
| S / ↓ | tagasikäik/pidur |
| A / D või ← / → | rool |
| Ctrl | boost — lühiajaline kiiruslisa (taastuv energia) |
| Shift | sõidukivõime |
| Tühik | veekahur |
| R | tagasi rajale (viimase värava juurde) |
| H | juhtimise legend |
| Esc | paus |

Toetatud on ka standardse paigutusega gamepad: RT gaas, LT pidur, vasak kepp
rool, B/RB boost, A sõidukivõime, X veekahur, Y tagasi rajale, Menu paus ja
View juhtimise legend. Menüüs saab liikuda D-padi või vasaku kepiga, A valib
ning B läheb tagasi. Vaatlejana liigutab vasak kepp kaamerat, parem kepp muudab
kõrgust ja A vahetab jälitatavat paati või vaba vaadet.

## Arendus

Vajalik: Node.js 20+.

```bash
npm install
npm run dev        # klient (Vite, :5173) + server (:8090) korraga
```

Ava http://localhost:5173 — Vite proksib WebSocketi serverisse.

Abilehed arenduseks: `/boat-test.html` (kõik paadimudelid),
`/wake-test.html` (kiiluvee render-target).

```bash
npm run typecheck  # kõik kolm workspace'i
```

## Kontorivõrku üles panemine

Üks masin (nt vaba arvuti või VM) jooksutab serverit; kolleegid avavad
brauseris selle masina aadressi. Üks port, üks protsess:

```bash
npm install
npm run build            # ehitab kliendi client/dist alla
npm start                # serveerib mängu + WebSocketi pordil 8090
# või muu port:
PORT=9000 npm start
```

Seejärel jaga link: `http://<masina-ip>:8090`

Kui ees on ettevõtte HTTPS-proksi, töötab WSS automaatselt (klient ühendub
alati `location.host` kaudu).

## Arhitektuur

```
shared/   — protokoll, sõidukistatid, rajadefinitsioonid, lainefunktsioon
server/   — ws + express: toad, sessioonid, võistluse faasimasin,
            tulemuste autoriteet (väravate järjekord, ringid, ajad)
client/   — Three.js: Gerstner-laine ookean (CPU/GPU ühine matemaatika),
            arkaadfüüsika, protseduurilised mudelid, Web Audio süntees
```

Võtmeleping: `shared/src/waves.ts` lainefunktsioon on identne
ookeanishaderi omaga (`client/src/world/ocean.vert.glsl`) — nii istuvad
paadid täpselt nähtavatel lainetel. Kui muudad üht, muuda ka teist.

Multiplayeri mudel: kliendid simuleerivad oma paati ise ja saadavad
positsioone 15 Hz (usaldusväärne kontorivõrk); server releeb need teistele
(renderdus 150 ms interpolatsioonipuhvriga) ning on ainuisikuliselt
autoriteetne võistlustulemuste üle.

## Litsents

Ettevõttesiseseks kasutuseks.
