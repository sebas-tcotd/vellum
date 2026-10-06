# Microsoft Store submission pack

- [Español](../es/store-submission.md)
- [Back to the English index](index.md)

Everything Partner Center asks for in Vellum's first submission, ready to copy.
This is the material for Story 6.3. The technical package is covered in
[Microsoft Store MSIX](msix.md).

This document proposes text and answers; **it submits nothing**. The person who
submits must confirm every age-rating answer and the category in Partner Center.

## Verified before writing

| Check                                                                                              | Status                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `https://sebas-tcotd.github.io/vellum/privacy/` responds, with canonical and `data-page="privacy"` | Verified on 2026-10-06.                                                                                                            |
| The policy page does not load Google Analytics                                                     | Verified: no Google resources, no `gtag`, no cookies.                                                                              |
| The landing does not load Analytics before a choice                                                | Verified: no Google resources, no `dataLayer` and no cookies while the banner is visible.                                          |
| The landing does not load Analytics after "Reject analytics"                                       | Verified: still no Google resources or cookies; only the choice is stored in `localStorage`.                                       |
| "Accept analytics" sends events only after accepting                                               | **Not tested** on purpose, to avoid sending events to the real GA4 property. GA4 consent indicators are reviewed after deployment. |

Privacy URL for Partner Center: `https://sebas-tcotd.github.io/vellum/privacy/`

## Submission data

| Field                  | Value                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Reserved name          | Vellum City Maps                                                                                                                      |
| Package identity       | `SebastianVargasPizango.VellumCityMaps`                                                                                               |
| Publisher              | `CN=F93C1C62-364D-4C65-83BA-6DDD8A04B97F`                                                                                             |
| Publisher display name | Sebastian Vargas Pizango                                                                                                              |
| Architecture           | x64 only                                                                                                                              |
| Minimum Windows        | `10.0.17763.0`                                                                                                                        |
| Listing languages      | English (en-us) and Spanish (es-es), the same the manifest declares                                                                   |
| Category               | To confirm in Partner Center. Candidates: "Utilities & tools" or "Photo & video". Do not pick a games category: Vellum is not a game. |
| Price                  | Free                                                                                                                                  |
| Publication            | Select **"Don't publish this submission until I select Publish now"**.                                                                |
| Website and support    | `https://sebas-tcotd.github.io/vellum/` and `https://github.com/sebas-tcotd/vellum/issues`                                            |
| Product license        | MIT, open repository                                                                                                                  |

## English listing

**Short description**

> Turn your Cities: Skylines city into a map worth keeping.

**Description**

```text
Vellum turns a Cities: Skylines city into an interactive, printable map. It draws
terrain, water, roads, transit lines, buildings, forests and districts as clean,
layered cartography that you can explore, restyle and export.

Everything happens on your computer. Vellum needs no account, makes no network
requests of its own and never uploads your cities.

WHAT YOU CAN DO
• Open a city and explore it as a real map: pan, zoom and switch layers on and off.
• Open the included sample city, Costa Tijuca, to try Vellum without any file of your own.
• Inspect a place on a side card: districts, specialized areas and buildings.
• Read the transit network, and switch to a separate schematic view of the lines.
• Choose a built-in theme or create your own, and choose how forests look.
• Export the map as PNG or SVG.
• Open .vellummap files exported with Vellum Bridge, or existing .cslmap files.

OPENING YOUR OWN CITY
Export your city from the game with Vellum Bridge, then double-click the file or
open it from Vellum.

NOTES
• If you already used the standalone Vellum installer, your preferences and custom
  themes are not carried over: the Microsoft Store edition keeps its data separately.
  Copy your themes before uninstalling anything.
• Updates are delivered by Microsoft Store.
• Vellum is open source (MIT).

Vellum is an independent open-source project and is not affiliated with or endorsed
by Colossal Order or Paradox Interactive.
```

**What's new**

```text
First release on Microsoft Store.
```

**Search terms**: `city map`, `map viewer`, `map export`, `SVG map`, `PNG map`, `transit map`, `cartography`.
Do not use "Cities: Skylines", "Colossal Order" or "Paradox" as a search term.

## Spanish listing

The Spanish short description, description, "what's new" and search terms are in the
[Spanish version of this document](../es/store-submission.md#ficha-en-español). They
are kept in one place so the two languages cannot drift apart.

## Rules this listing follows

- It describes only what the submitted version has. Before submitting, check each
  bullet against the packaged build, especially "specialized areas" and the theme
  names, which must match what the app shows.
- "Cities: Skylines" appears only in the description, next to the non-affiliation notice.
- It uses no Paradox or Colossal Order logos.
- It does not say Vellum checks for updates: on the Store it does not. The
  `longDescription` in `tauri.conf.json` stays true for the standalone edition and is
  not reused here.
- It warns that preferences and themes do not carry over from the standalone edition.

Two package fields outside the listing, in case Partner Center or review surfaces them:
the MSIX manifest `Description` is "Turn Cities: Skylines saves into printable maps."
(not a search term, but it names the game outside the listing description), and the
`shortDescription` in `tauri.conf.json` says the same. Decide whether to reword them
before submitting.

## Screenshots and artwork

Capture from the final package, with the Costa Tijuca sample and the views already
clean. The Store requires at least one desktop screenshot; 4 to 8 is better.

- [ ] Map overview with the sample, default theme.
- [ ] Layers panel open with several layers on.
- [ ] Place side card (PlaceCard).
- [ ] Schematic view of the transit network.
- [ ] A second built-in theme on the same city.
- [ ] The PNG/SVG export dialog.
- [ ] No personal data, user names or private paths visible.
- [ ] No Paradox or Colossal Order logos.

The package icons already exist in `apps/desktop/src-tauri/icons/windows`.

## Age rating questionnaire (IARC)

Proposed answers, to confirm in Partner Center. Vellum is a map-drawing tool: no
accounts, no online user-generated content, no purchases or ads, no location, no
network.

| Question                                          | Proposed answer                 |
| ------------------------------------------------- | ------------------------------- |
| App category                                      | Utility / reference, not a game |
| Violence, blood, crude language, sexual content   | No                              |
| Drugs, alcohol, tobacco, gambling                 | No                              |
| User interaction or online user-generated content | No                              |
| Shares the user's location                        | No                              |
| In-app purchases or ads                           | No                              |
| Unrestricted Internet access                      | No                              |
| Collects personal information                     | No                              |

The expected rating is suitable for all ages. If Partner Center asks about Internet
access: the Store edition makes no network requests of its own, but Microsoft's
WebView2 runtime may connect on its own (see the validation log in [MSIX](msix.md)).

## Certification notes

Text for the "Notes for certification" field in Partner Center:

```text
Vellum is an offline desktop app. No account, sign-in or network connection is needed
to test it.

1. Launch Vellum. The welcome screen offers a bundled sample city, Costa Tijuca.
   Click it to open the map.
2. Pan and zoom the map.
3. Open the layers panel and toggle several layers on and off.
4. Click a place on the map to open its side card.
5. Open the schematic view of the transit network and return to the map.
6. Export the map as PNG: choose an export destination in the dialog and confirm
   the file is written. The bundled sample is never modified.

The app declares the runFullTrust capability because it is a Tauri (WebView2) desktop
application packaged as MSIX. It uses the Microsoft Edge WebView2 Runtime. On Windows 10
without that runtime, the app shows a native notice with a download link instead of
closing silently.

File associations: .cslmap and .vellummap (double-click opens the file in Vellum).
Privacy policy: https://sebas-tcotd.github.io/vellum/privacy/
```

## Before pressing "Submit"

- [ ] Story 6.2 closed: validation on clean Windows 10 and 11, see [MSIX](msix.md).
- [ ] Final package built from the 1.0.0 release and its hash recorded.
- [ ] Costa Tijuca attribution and redistribution permission recorded in [Sample city](sample-city.md).
- [ ] Screenshots taken from the final package.
- [ ] IARC questionnaire answered by the person submitting.
- [ ] "Don't publish until I select Publish now" selected.
- [ ] `/privacy` still responds at the submitted URL.

## After submitting

A first submission can bounce: leave margin before the announcement. If the rejection
is only about the listing or certification, fix it in Partner Center and resubmit the
same package. If it requires changing the package, a new version (1.0.1) is needed,
because the Store does not accept two packages with the same version.
