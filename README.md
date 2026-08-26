# Doorknock

A canvassing map you can run yourself. Upload a spreadsheet of people — names, street
addresses, city, postal code — and every door becomes a pin. Tap a pin to see who lives
there, record what happened at the door, take notes, and watch the pin change colour as
your team works through the list.

Everything runs in the browser. There is no server, no account, and no database to set up:
the workspace lives in the browser's own storage and can be exported to a file.

![The door panel: residents, response buttons, tags and notes](docs/screenshot-door.png)

_Basemap tiles are blank in these captures — the machine that took them had no route to the
tile servers. They load normally on a real network._

## What it does

**Upload a list**
- Reads `.xlsx`, `.xls` and `.csv` in the browser — nothing is uploaded anywhere.
- Guesses which column is the name, the address, the city, the postal code, the poll, and
  so on, and lets you correct any of them before importing.
- Groups people living at the same address into one door, so a household of four is one
  pin with four residents, not four overlapping pins.
- Understands `LASTNAME, FIRSTNAME`, strips `UNIT 27` off the end of an address, and puts
  the space back into Canadian postal codes (`N1S4C2` → `N1S 4C2`).
- If your sheet already has latitude/longitude columns, it uses them and skips geocoding.

**Turn addresses into pins**
- Geocodes the list against OpenStreetMap's Nominatim (free) or Mapbox (fast, needs a
  token), one address at a time, with a progress bar you can pause and resume.
- Every lookup is cached on disk, so re-importing the same list is instant.
- Addresses that can't be found are listed for you; open one and drop its pin by hand.

**Knock doors**
- Click a pin — or a row in the door list — to open the door panel: residents, occupancy,
  phone, email, poll, and every original column from your spreadsheet.
- One tap marks the door knocked; the pin switches from a dashed outline with initials to
  a solid check mark, and its colour follows the response you record.
- Responses: strong support, leaning support, undecided, opposed, not home, come back
  later, refused, moved, do not contact. A resident can carry a different response from
  the rest of the household.
- Timestamped notes, quick tags (sign requested, volunteer, needs ride, dog…), and inline
  edits to phone and email when the file is out of date.

**Organise the walk**
- **Cut turf**: draw a shape on the map and every door inside becomes a turf, with its own
  knocked/total progress bar.
- **Team**: add canvassers, assign turf to them, and pick who is knocking — their name is
  stamped on the knocks and notes they record.
- Filter by response, poll, city, turf, canvasser, or "not knocked yet"; sort the list in
  walk order (street, then house number) or by what is closest to you.
- Live counters across the top of whatever you have filtered to.

**Get the data back out**
- Export an `.xlsx` that keeps every original column and adds status, knocked-at, visits,
  notes, tags, turf, canvasser and coordinates.
- Export a project file (`.json`) to move the whole workspace — doors, turf, notes — to
  another device, or to hand a turf off to someone else. Load it from the upload screen.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Then click **Upload list**. `sample-data/sample-walk-list.csv` is a 30-person demo list
with coordinates already in it (invented names, real Cambridge, Ontario streets), so you
can try the whole flow without waiting on the geocoder.

To build for production:

```bash
npm run build        # static files in dist/ — host them anywhere
npm run preview
```

`npm run dev -- --host` serves on your local network, which is the easy way to try it on a
phone in the field.

## What your spreadsheet needs

Only a street address column is required. Everything else is optional and improves the
result:

| Column | Example | Used for |
| --- | --- | --- |
| Name | `AYUB, SAMIA` | who lives there |
| Property Address | `197 BLAIR RD` | the pin (required) |
| City | `CAMBRIDGE` | geocoding accuracy |
| Postal / ZIP | `N1S4C2` | geocoding accuracy |
| Poll / ward | `Ward 05 Poll 501` | filtering |
| Occupancy | `Owner`, `Tenant` | shown on the door panel |
| Phone / email | | shown and editable |
| Latitude / Longitude | `43.3689`, `-80.3298` | skips geocoding entirely |

Unmapped columns are not thrown away — they show up under "original spreadsheet fields" on
the door panel and come back in the export.

## Geocoding, honestly

- The default geocoder is OpenStreetMap's public Nominatim service. Its usage policy allows
  about **one request per second**, so a 1,000-address list takes roughly 20 minutes. Leave
  the tab open; it resumes where it left off and the cache means you only pay that cost
  once per address.
- Put an email address in **Data → settings** so OSM can contact you rather than block you
  if a large run looks like abuse.
- For anything bigger, switch to Mapbox and paste a token: same flow, roughly ten times
  faster.
- **Addresses do leave your browser when you geocode them** — that is the one network call
  this app makes with your data, and it goes to whichever geocoder you pick. Names, notes,
  phone numbers and responses never do.

## Where the data lives

In IndexedDB, in the browser you are using, on that device. Nothing syncs. That means:

- Closing the tab is safe — the workspace is saved continuously and restored on reload.
- Clearing site data deletes it. Export a project file before you clear anything.
- Two canvassers on two phones have two separate workspaces. Give each one their own turf,
  then merge by exporting each device's `.xlsx` at the end of the shift.

Real-time multi-device sync needs a backend, which this deliberately doesn't have.

## Stack

React + TypeScript + Vite, Leaflet with marker clustering, SheetJS for spreadsheets
(loaded on demand), Zustand for state, idb-keyval for storage. Map tiles from CARTO,
OpenStreetMap and Esri; no API keys required for anything except the optional Mapbox
geocoder.

```
src/
  components/   MapView, ImportWizard, DoorList, HouseholdPanel, TurfTab, TeamTab, DataTab
  lib/          parse (xlsx → households), normalize, geocode, geo, storage, export
  state/        store (zustand), useGeocoder
```

## Possible next steps

- A small sync server so a field director and their canvassers share one live list.
- Per-canvasser walk sheets as printable PDFs for when phones die.
- Offline tile caching for basements and rural routes.
- Bulk actions: mark a whole street not home, reassign turf in one move.
