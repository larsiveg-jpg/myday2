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

## Legge appen på hjemskjermen

Åpne `https://larsiveg-jpg.github.io/myday2/` på telefonen, logg inn og velg «Legg til på Hjem-skjerm» (Safari: Del-knappen, Chrome: menyen).
