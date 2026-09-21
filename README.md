# ScooterScanner

Bluetooth-diagnose voor de Onemile scooter (o.a. om te bepalen hoe de **Halo City**
verbindt). Simpele webpagina die een niet-technische gebruiker kan draaien: scooter aan →
**Start test** → apparaat kiezen → **Mail naar Jesse**.

- **Live:** https://scooterscanner.wissinc.eu/
- **Bestand:** `index.html` (self-contained, geen build, geen dependencies)

## Wat het doet
- Scant via **Web Bluetooth** naar een apparaat met naam `YL…` (of handmatig uit alle apparaten).
- Verbindt (BLE GATT, geen pincode/bonding) en leest alle toegankelijke services + kenmerken.
- Leest standaard **Device Information** (fabrikant, modelnummer, firmware, serienummer) en
  **Battery** — verklapt vaak model + firmware van de scooter.
- Als het bekende Onemile-protocol aanwezig is: stuurt één **veilig uitleеs-vraagje**
  (`AA0104AF`, géén slot/besturing) en toont het antwoord.
- Geeft een groen/oranje/rood oordeel, **onthoudt** runs in localStorage, maakt een rapport
  en laat de gebruiker het **mailen** (adres vooringevuld) of als **.txt** opslaan.
- Stuurt zelf **niets** naar een server; alleen de mail die de gebruiker zelf verzendt.

## Hosting-eisen (belangrijk)
Web Bluetooth op Android werkt **alleen**:
- op een **top-level https-pagina** met geldig TLS-certificaat (geen iframe, geen `file://`);
- in **Chrome/Edge op Android** (niet in Safari/iOS).

Serveer `index.html` dus gewoon statisch op de subdomein-root. Verder is geen configuratie nodig.

## Bekend Onemile BLE-protocol (uit reverse-engineering v1.3.1)
- Service `00007000-61B2-21F8-BCE3-94EEA697F98C`
- Write-characteristic `00007001-…`, Notify `00007002-…`
- Device-naam-prefix `YL ` (+ serienummer)
- Frames: `AA <cmd> <len> … <checksum>`, checksum = som van bytes mod 256
  (`0xAA+0x01+0x04 = 0xAF`). Query-frames o.a. `AA0104AF`, `AA0204B0`, `AA0304B1`,
  `AA0504B3`, `AA0604B4`, `AA0804B6`.

> Let op: of de **Halo City** dit protocol spreekt is nog niet bevestigd — dat is precies
> wat deze scanner moet uitwijzen. Zo niet, dan gebruikt hij een ander/nieuwer protocol en
> is nRF Connect (of de nieuwere Onemile-APK) nodig.
