# MyDay 2.0

Felles kalender, handleliste og sanntidsavganger for to personer. Bygget med [Designsystemet](https://designsystemet.no), [Firebase](https://firebase.google.com) for deling og [Entur](https://developer.entur.org) for avganger.

Appen er en vanlig nettside uten byggesteg og publiseres med GitHub Pages fra `main`.

## Filer

| Fil | Innhold |
|---|---|
| `index.html` | Markup for alle visninger |
| `app.css` | Egen CSS i `@layer myday`, bare `--ds-*`-tokens |
| `app.js` | Logikk: innlogging, Firestore, Entur |
| `config.js` | Firebase-konfigurasjon og Entur-klientnavn |
| `firestore.rules` | Hvem som får lese og skrive dataene |
| `theme/myday.css` | Fargetema generert med Designsystemet-CLI |
| `worker/` | Prisstasjon (Cloudflare Worker) for Rema 1000-priser fra Kassalapp |
| `manifest.webmanifest`, `icons/` | Hjemskjerm-app (PWA) |

## Oppsett av Firebase (én gang)

1. Gå til [console.firebase.google.com](https://console.firebase.google.com) og lag et prosjekt, for eksempel «myday». Google Analytics trengs ikke.
2. **Authentication** → Kom i gang → slå på **E-post/passord**. Under **Users**, legg til en bruker for hver av dere.
3. **Authentication** → **Settings** → **Authorized domains**: legg til `larsiveg-jpg.github.io`.
4. **Firestore Database** → Opprett database → velg `eur3 (Europe)` → produksjonsmodus.
5. **Firestore Database** → **Regler**: lim inn innholdet i `firestore.rules`, med deres to e-postadresser, og publiser.
6. **Prosjektinnstillinger** (tannhjulet) → Dine apper → legg til **Nettapp** (`</>`). Kopier verdiene i `firebaseConfig` inn i `config.js`.

## Entur

Avganger og holdeplass-søk bruker Enturs åpne API-er. Ingen nøkkel trengs, men hver forespørsel sender klientnavnet fra `config.js`.

## Priser i handlelista (Kassalapp, én gang)

Prisene er Rema 1000-priser fra [Kassalapp](https://kassal.app). Nøkkelen deres må holdes hemmelig, så appen spør via en liten Cloudflare Worker (gratis) som også sjekker at det er en av dere som er logget inn.

1. **Kassalapp:** Lag en konto på [kassal.app](https://kassal.app), gå til profilen → **API** og lag en nøkkel. Kopier den med en gang (den vises bare én gang).
2. **Cloudflare:** Lag en gratis konto på [dash.cloudflare.com](https://dash.cloudflare.com). Gå til **Workers & Pages** → **Create** → **Create Worker** (start fra «Hello World»), kall den `myday-priser` og trykk **Deploy**.
3. Trykk **Edit code**, slett alt og lim inn hele `worker/worker.js`. Trykk **Deploy**.
4. Gå til Worker-ens **Settings** → **Variables and Secrets** → **Add**: type **Secret**, navn `KASSAL_KEY`, verdi = nøkkelen fra steg 1. Lagre.
5. Kopier adressen til Worker-en (f.eks. `https://myday-priser.ditt-navn.workers.dev`) og lim den inn i `priceApi` i `config.js`.
6. **Firebase** → **Firestore Database** → **Regler**: lim inn `firestore.rules` på nytt (den har fått en linje for `products`) og publiser.

Uten `priceApi` er priser og skanning skjult. Gratisnivået hos Kassalapp er for ikke-kommersiell bruk og tillater rundt 60 forespørsler i minuttet. Prisene kan avvike litt fra hylleprisen i butikken.

## Legge appen på hjemskjermen

Åpne `https://larsiveg-jpg.github.io/myday2/` på telefonen, logg inn og velg «Legg til på Hjem-skjerm» (Safari: Del-knappen, Chrome: menyen).
