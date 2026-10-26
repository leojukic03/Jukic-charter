# Merry Fisher 795 · Biograd na Moru: web stranica i vodič za goste

Statična stranica, bez build koraka. Radi na bilo kojem hostingu s HTTPS-om (Cloudflare Pages, Netlify, GitHub Pages).

| Putanja | Što je |
| --- | --- |
| `index.html` | Prodajna stranica (HR): scroll priča „dan na brodu” na stvarnoj karti otoka, brod, vodič, cijene, kalendar s rezervacijom, pitanja |
| `en/index.html` | Engleska verzija, **generira se** iz `index.html` (`tools/build-en.ps1`) |
| `vodic/` | Vodič za goste (HR/EN): karta, rute po moru, planer izleta, vjetar i valovi. Radi i bez signala za već otvoreno |
| `js/config.js` | **Sve što mijenjaš**: ime, kontakti, cijene, sezone, podaci o brodu, potrošnja goriva, pragovi upozorenja, API ključ |
| `data/featured.json` | Preporučena mjesta (opisi HR/EN) i preporučene rute |
| `data/booking.json` | Cijene po sezoni (dnevna i tjedna), min./maks. dana, čišćenje, polog, predujam (jedini izvor; čita ga i server) |
| `data/availability.json` | Zauzeti datumi samo kad server nije postavljen |
| `functions/api/`, `server/`, `shared/` | Online rezervacija: Cloudflare Pages Functions + D1 + Stripe |
| `admin/` | Pregled rezervacija i zatvaranje termina za vlasnika |
| `uvjeti/` | Uvjeti najma (nacrt, upiši svoja pravila) |
| `schema.sql`, `wrangler.example.toml`, `_headers`, `tools/build-dist.sh` | Baza, postavke i build za Cloudflare Pages |
| `data/pois-all.json` | ~8.600 mjesta s cijelog Jadrana iz OpenStreetMapa (sloj „Sve”) |
| `data/mask-*.png` | Karte kopno/more za rutiranje (40 m oko Biograda–Kornata, 400 m za cijeli Jadran) |
| `sw.js`, `manifest.webmanifest` | Rad bez signala i instalacija na početni zaslon |
| `tools/` | Skripte za ponovnu izradu podataka i lokalni server |

## Lokalno pokretanje

Na **Macu** (Terminal, u mapi projekta):

```bash
python3 tools/serve.py --mock-api
```

Na **Windowsima**:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools/serve.ps1 -MockApi
```

Zatim otvori http://localhost:8123/, http://localhost:8123/vodic/ i http://localhost:8123/admin/. S `--mock-api` / `-MockApi` rezervacija, galerija i admin vraćaju probne podatke iz `tools/mock-api.json`; bez toga stranica radi kao da server za rezervacije nije postavljen (zahtjev ide na WhatsApp). U Claude aplikaciji isto pokreću konfiguracije `site-mac-mock-api` (Mac) i `site-mock-api` (Windows) iz `.claude/launch.json`.

Ako Mac javi da nema `python3`, pokreni `xcode-select --install` i pokušaj ponovno.

## Prije objave: zamijeni primjere

Ništa od ovoga nisam mogao znati, pa su u kodu primjeri označeni s `PROVJERI`:

1. **`js/config.js`**: ime firme, telefon, WhatsApp, e-mail, adresa veza, podaci o brodu (broj osoba, duljina, motor, spremnik, oprema), cijena goriva i **tablica potrošnje** (`speeds`, procjena za 200 KS izvanbrodski motor).
2. **Domena:** stranica je postavljena na `https://jukic-charter.pages.dev/`. Ako kupiš vlastitu domenu, zamijeni je u `index.html` (canonical, hreflang, og:image, JSON-LD), `sitemap.xml`, `robots.txt`. Nakon izmjene `index.html` pokreni `tools/build-en.ps1`.
3. **Odgovori u „Pitanjima”** opisuju pravila koja moraš potvrditi: gorivo „pun–pun”, dječji prsluci na brodu, ponašanje kod lošeg vremena.
4. **Fotografije i podaci o brodu** dodaješ u `/admin/` (vidi „Fotografije i podaci o brodu” niže). Dok nema fotografija, stranica prikazuje ilustraciju.
5. **Recenzije gostiju**: nisam izmišljao recenzije. Kad ih imaš (Google, Booking, Airbnb), dodaj nekoliko pravih uz cijene.
6. **Cijene i pravila rezervacije** su u `data/booking.json`: najam isključivo bez skipera, od `minDays` (3) do `maxDays` (21) dana; `perDay` vrijedi za 3–6 dana, od `weeklyFromDays` (7) dana `perWeek`/7 po danu; svaki dan se naplaćuje po svojoj sezoni; `cleaningFee` jednom po najmu; `checkIn`/`checkOut` vremena; `payment.mode` `advance` = predujam `advancePercent` % (sada 30 %), ostatak pri preuzimanju. Isti podaci se prikazuju na stranici i koriste na serveru za Stripe.
   **Predložene cijene** (provjeri): predsezona 190 €/dan ili 1.150 €/tjedan, sezona 260 € ili 1.600 €, vrhunac 360 € ili 2.250 €, čišćenje 90 €. Usporedba: bareboat Merry Fisher 795 u Hrvatskoj stoji oko 1.000–1.600 € tjedno izvan sezone i 2.000–2.900 € u srpnju i kolovozu; brodovi u Biogradu kreću od oko 1.065–1.235 € tjedno.
7. **Uvjeti najma** (`uvjeti/index.html`): pravila otkazivanja, lošeg vremena, odgovornosti i podatke o firmi upisuješ ti (označeno žuto).

## Online rezervacija s plaćanjem

Kako radi:

1. Gost odabere dan preuzimanja i broj dana (3–21) u kalendaru; dani koji ne mogu biti početak najma (nema 3 slobodna dana zaredom) su onemogućeni. Zauzetost dolazi uživo s `/api/availability`.
2. Klik na „Rezerviraj i plati”: server (`/api/checkout`) provjeri podatke, **sam izračuna cijenu**, zadrži sve dane 30 min i otvori Stripe Checkout (kartice, Apple Pay, Google Pay; ovisno o postavkama u Stripeu).
3. Stripe javi uspješno plaćanje na `/api/stripe-webhook` → rezervacija je potvrđena → server izdaje **fiskalizirani račun za predujam** preko Sola → gost i vlasnik dobiju e-mail s poveznicom na račun (ako je postavljen Resend). Stripeova potvrda plaćanja nije fiskalni račun.
4. Ako gost odustane, termin se odmah oslobađa; ako samo zatvori prozor, oslobađa se nakon 35 min.

Dva gosta ne mogu platiti dane koji se preklapaju: zadržavanje je jedna SQL naredba koja upisuje samo ako nijedan dan raspona nije zauzet ni zatvoren. Jedan posjetitelj može imati najviše 3 otvorena plaćanja. Polog (jamčevina) se plaća na vezu, jer Stripe ne može držati iznos na kartici više od 7 dana.

**Za vlasnika:** `/admin/` (prijava s `ADMIN_TOKEN`): popis plaćenih rezervacija i otvorenih plaćanja, broj i PDF računa (ili gumb „Izdaj račun” ako izdavanje nije uspjelo), iznos za naplatu pri preuzimanju, otkazivanje, zatvaranje raspona dana (telefonske rezervacije, servis, vlastito korištenje). Povrat novca radiš u Stripeu. Kalendar možeš pretplatiti u Google/Apple kalendaru: `https://tvoja-domena/api/calendar.ics?token=ICAL_TOKEN`.

Bez postavljenog servera (npr. lokalno) stranica sama prelazi na stari način: zahtjev na WhatsApp i zauzetost iz `data/availability.json`.

### Postavljanje (jednom, ~30 min)

Treba: račun na Cloudflareu (besplatni plan je dovoljan) i Stripe račun firme.

1. **Objava s GitHuba:** Cloudflare → Workers & Pages → Create → Pages → Connect to Git → odaberi `leojukic03/Jukic-charter`. Project name: `jukic-charter` (adresa postaje `jukic-charter.pages.dev`), Production branch: `main`, Framework preset: None, **Build command: `bash tools/build-dist.sh`**, **Build output directory: `dist`**. Cloudflare sam prepozna mapu `functions/`. Svaki `git push` na `main` sam objavi novu verziju. Bez koraka 2–4 stranica i vodič već rade, a rezervacija šalje zahtjev na WhatsApp.
2. **Baza i fotografije:** Cloudflare → Storage & Databases → D1 → Create `charter`. U konzoli baze zalijepi i pokreni sadržaj `schema.sql`. Zatim R2 → Create bucket `jukic-charter-photos`. U Pages projektu → Settings → Bindings dodaj D1 (`DB` → `charter`) i R2 (`PHOTOS` → `jukic-charter-photos`).
3. **Stripe:** Developers → API keys → kopiraj *Secret key*. Developers → Webhooks → Add endpoint `https://tvoja-domena/api/stripe-webhook`, događaji: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`; kopiraj *Signing secret*. U Settings → Emails uključi slanje računa za uspješna plaćanja.
4. **Varijable** u Pages → Settings → Variables and secrets (kao *Secret*):
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_TOKEN` i `ICAL_TOKEN` (svaki barem 32 nasumična znaka), `SITE_URL` (npr. `https://www.tvoja-domena.hr`).
   Za račune: `SOLO_TOKEN`, `SOLO_TIP_RACUNA` (vidi „Računi i fiskalizacija”).
   Za e-mail potvrde (neobavezno): `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL`.
5. **Prvo testiraj u Stripe test načinu** (`sk_test_…` i test webhook): plati karticom `4242 4242 4242 4242`, provjeri da se dan prekriži u kalendaru i pojavi u `/admin/`. Tek onda zamijeni ključeve live ključevima.

Veze (D1, R2) i varijable postavljaš u Cloudflare nadzornoj ploči. Ako radije koristiš naredbeni redak (Wrangler), preimenuj `wrangler.example.toml` u `wrangler.toml` i upiši ID baze; tada te postavke vrijede iz datoteke, a ne iz nadzorne ploče.

### Testovi

`tools/api-test.html` (otvori preko lokalnog servera) pokreće pravi serverski kod nad SQLiteom (sql.js, isti motor kao D1) uz lažni Stripe, Solo i R2: 62 provjere cijene (tjedna, mješovite sezone, predujam), preklapanja raspona, min. 3 dana, obavezne dozvole, zadržavanja, webhooka (potpis, ponavljanje, stari potpis), oslobađanja, admina, kalendara, e-maila, računa (iznos točan u cent, ponovni pokušaj, nema dvostrukog računa) i fotografija (samo slike, redoslijed, brisanje). Za klikanje kroz stranicu bez Cloudflarea pokreni `tools/serve.ps1 -MockApi`.

## Računi i fiskalizacija

Plaćanje karticom (i preko Stripea) u Hrvatskoj se za fiskalizaciju smatra gotovinskim plaćanjem, a Stripe ne fiskalizira. Zato server odmah nakon plaćanja izdaje **račun za predujam** preko [Solo](https://solo.com.hr) API-ja, koji račun sam fiskalizira (FINA, JIR/ZKI). **Ostatak** naplaćuješ pri preuzimanju i za njega izdaješ konačni račun u Solo aplikaciji ili na svojoj blagajni, uz pozivanje na račun za predujam; admin pokazuje broj računa i iznos za naplatu.

Postavljanje:
1. Solo račun s plaćenim paketom (API: do 300 računa mjesečno; besplatni paket: 3) i u Solu postavljeni certifikat, poslovni prostor i operater za fiskalizaciju.
2. `SOLO_TOKEN` = token iz Solo → Postavke.
3. `SOLO_TIP_RACUNA` = oznaka vrste računa „Avansni” u Solo API-ju. Dokumentacija ju nije jednoznačno prikazala (4 ili 5), pa je **provjeri jednim probnim računom** i tek onda upiši. `SOLO_TIP_USLUGE` po potrebi (zadano 1).
4. **PDV** je `invoice.vatRate` u `data/booking.json` (sada 13 %). Najam plovila sa smještajem (noćenje na brodu) ide po 13 %, najam bez smještaja po 25 %; ako nisi u sustavu PDV-a, upiši 0. **Potvrdi s računovođom.** Predujam se po potrebi pomakne za 1–3 € tako da se iznos može točno rastaviti na osnovicu + PDV, pa se račun i naplata kartice slažu u cent.

Ako Solo ne odgovori ili javi grešku, rezervacija ostaje plaćena i potvrđena, a u adminu se pojavi „račun nije izdan” s razlogom i gumbom „Izdaj račun”. Otkazivanje: povrat novca u Stripeu, storno računa u Solu.

Ovo je tehničko rješenje, ne porezni savjet: prije objave neka računovođa potvrdi stopu PDV-a, način obračuna predujma i boravišne/nautičke pristojbe za tvoje plovilo.

## Fotografije i podaci o brodu

U `/admin/`:
- **Fotografije:** dodaj ih s mobitela ili računala (smanje se na najviše 2000 px prije slanja), složi redoslijed (prva je naslovna), upiši kratki opis na HR i EN, briši. Stranica ih prikazuje kao galeriju koja se lista prstom.
- **Podaci o brodu:** model, godina, duljina, širina, motor, broj osoba, ležajevi, spremnici, opis i oprema (HR/EN). Prazna polja se ne prikazuju.

**Službene fotografije Jeanneaua** nisam preuzeo: na njihovim stranicama nema dozvole za ponovnu upotrebu, a fotografije su autorsko djelo. Stranica zato samo vodi na službenu galeriju modela na jeanneau.com. Ako ti Jeanneau ili hrvatski zastupnik pisano dopusti korištenje (zastupnici to često daju za marketing), učitaj ih kroz admin; najbolje je ipak dodati i vlastite fotografije svog broda.

## Ponovna izrada podataka

Podaci su izrađeni jednokratno iz OpenStreetMapa (Overpass, VK Maps mirror) i Natural Earth; stranica ne zove Overpass u radu.

```bash
powershell -File tools/build-pois.ps1 -OsmDir <mapa s poi_adriatic.json i poi_food_fine.json>
powershell -File tools/build-en.ps1
powershell -File tools/build-images.ps1
```

Maske za rutiranje gradi `tools/MaskBuilder.cs` (učitava se iz PowerShella s `Add-Type`). Uski prolazi Ždrelac i Tisno su ručno „otvoreni” jer su uži od 40 m ćelije. Nakon promjene maski ili preporučenih mjesta povećaj `DATA_V` u `js/guide.js` i `VERSION` u `sw.js`.

## Licence API-ja i podataka

| Izvor | Za što | Komercijalna upotreba | Što treba |
| --- | --- | --- | --- |
| **Open-Meteo** (prognoza, valovi, temp. mora) | Vjetar, udari, smjer, valovi, more | **NE na besplatnom API-ju.** Uvjeti: besplatno samo za nekomercijalnu upotrebu; stranica charter firme je komercijalna. | Plan **API Standard** (1M poziva/mj). Upiši ključ u `config.js` → `weather.apiKey`; kod tada koristi `customer-api.open-meteo.com` / `customer-marine-api.open-meteo.com`. Iznos cijene nisam uspio pročitati sa stranice: provjeri na open-meteo.com/en/pricing. Podaci su CC BY 4.0, navedi Open-Meteo i DWD (već u podnožju). |
| **OpenFreeMap** (podloga karte) | Vektorske pločice | **DA**, besplatno, bez ključa i limita | Atribucija OpenFreeMap / OpenMapTiles / OpenStreetMap (MapLibre je prikazuje sam). Nema SLA. |
| **OpenStreetMap** podaci | Uvale, plaže, restorani, sidrišta, marine, pumpe, obala | **DA**, uz atribuciju | ODbL: „© OpenStreetMap contributors”. `data/pois-all.json` je izvedena baza, pa ostaje pod ODbL-om. |
| **Overpass API** | Samo jednokratno preuzimanje pri izradi | Javni poslužitelji nisu za produkcijski promet aplikacije | Stranica ga ne koristi u radu. |
| **OpenSeaMap** (pomorske oznake) | Sloj „Pomorske oznake”, isključen po defaultu | **Nije potvrđeno.** Podaci CC BY-SA, ali uvjeti korištenja njihovog tile servera nisu objavljeni | Prije objave pitaj OpenSeaMap ili ukloni sloj (`map.seamarkTiles` u `config.js`). |
| **Natural Earth** | Obala Jadrana za duge rute | **DA**, javno vlasništvo | Ništa. |
| **MapLibre GL JS** 4.7.1 | Prikaz karte | **DA**, BSD-3 | Učitava se s unpkg.com. |
| **Archivo** font | Tipografija | **DA**, SIL OFL | Hostan lokalno (bez Google Fonts poziva, bolje za GDPR). |

Razmatrao sam i odbacio: **MET Norway** (CC BY, komercijalno dopušteno, ali za Jadran nema udara vjetra, a prognoza valova pokriva samo sjeverozapadnu Europu), **CARTO** podloge (komercijalno samo do 1M zahtjeva/mj uz ključ), **OSM standardne pločice** (bez SLA, nisu za komercijalne aplikacije).

**Napomena o ključu:** API ključ u `config.js` vidi svatko tko otvori izvorni kod. Ako želiš da ostane tajan, stavi mali proxy (npr. Cloudflare Worker) koji dodaje ključ i kešira odgovore 15–30 min.

## Model goriva i sigurnost

Procjena goriva = NM ÷ brzina × L/h iz `config.js`, uz 20 % rezerve u planeru. Pragovi upozorenja (`safety`) su namjerno stroži od CE kategorije C jer brodom upravljaju gosti: oprez od 12 čv vjetra / 18 čv udara / 0,5 m vala, opasno od 18 / 25 / 1,0 m; bura s udarima od 20 čv i jugo od 15 čv su odmah „opasno”.

Vodič služi za planiranje i ne zamjenjuje službene pomorske karte ni prognozu DHMZ-a; to piše i u samom vodiču.

## Alati za razvoj

- `vodic/?debug` izlaže kartu kao `window.guideMap`; `?rafpoly` pokreće animacije bez `requestAnimationFrame` (za preglede u pozadinskim karticama); `?data=worst` dodaje namjerno nezgodna mjesta (dugačko ime, bez imena, jedno slovo) za provjeru izgleda.
- `tools/route-test.html` crta masku i rutu: `?a=lon,lat&b=lon,lat`.
