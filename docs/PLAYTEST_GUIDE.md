# M11 playtest guide

## Start

1. Launch the app. The main menu shows the 1900 map, campaign card and world
   statistics.
2. Choose **New campaign**.
3. Confirm the scenario screen: campaign start **1 January 1900**, one day per
   tick, 66 playable states, 66 dependent territories, 20 markets.
4. Choose a country:
   - search by historical name, common name, capital or tag;
   - filter by continent;
   - toggle **Playable only** / **All territories**;
   - click a country or territory on the map (small states are markers; use the
     list or zoom);
   - read the detail panel: status, capital, sovereign, market, population
     estimate and description;
   - dependencies show why they cannot be played.
5. Confirm **Play as …**. The game view appears only after the worker validates
   and creates the campaign.

## Main screen

- **Top bar:** country emblem and name, status, capital, date, treasury,
  population, hardship, last closed month, play/pause, day step, speed 1/3/10/30,
  save/load, restart worker.
- **Navigation:** World, Overview, Budget, Markets, Industry, Construction,
  Trade, Labor & health, Money, Population, Politics, Technology, War &
  diplomacy, Ledger.
- **World:** map with Political / Control / Markets layers, zoom buttons and
  legend. Clicking a polity selects it and the right-hand panel shows status,
  sovereign, controller (if occupied), region population/buildings, country
  indicators and market membership.
- **Markets:** each market card shows its authored name, kind, description,
  customs administration, currency context, every member country and every
  included region. **Highlight members on the map** opens the market layer.

## What to verify

### Country selection and persistence

- Start campaigns as countries in different regions (for example United States,
  Japan, Transvaal, Brazil, Russia, Ethiopia) and confirm the top bar identity is
  the selected country, not a default.
- Select a colony (for example British India) and confirm it is inspectable but
  not playable.
- Save, restart the app, Continue: the selected country is preserved.
- Restart the worker while playing: the fresh world is created for the same
  player country, not a default.

### Map

- Pan, zoom with buttons, pinch/wheel; reset view.
- Click a territory; the detail panel and list selection agree.
- On desktop, hover a polity for a name/status/capital tooltip.
- Switch to Control and confirm the occupation overlay only appears when a
  region has a controller (a war/peace test is required to create one).
- Switch to Markets and confirm member territories are coloured by market.
- Confirm the map works with the network disabled (geometry is bundled).

### Markets

- No market is labelled only by a number.
- Multi-country markets list all members (for example the Latin American Trade
  Area, or the British Empire and Sterling Area with its dominions).
- Customs administration is shown separately from sovereignty.

### Sliders

- Drag each slider; the numeric field, ticks and preview update.
- Release; a pending indicator appears briefly and the authoritative snapshot
  updates.
- Type an exact value in the numeric field and press enter/blur.
- Use the keyboard step buttons and, with a screen reader, the adjustable
  increment/decrement actions.
- Values outside the range clamp to the nearest valid step.

### Responsive layout

- Wide window: navigation rail, three-column country selection, map + side
  panel.
- Narrow window: horizontal navigation, stacked selection, map above the detail
  panel, usable sliders and buttons.

## Known limits

- Some 1900 borders are approximated by modern source units (Congress Poland,
  Alsace-Lorraine, Austria-Hungary's Galicia/Transylvania/Vojvodina, Tibet).
- Sokoto, Wadai, Darfur, Ha'il, Crete, Tonga, Tibet, Khiva, Bukhara and Sarawak
  use marker-only map integration; their historical 1900 polygons are unavailable.
- Newfoundland is a marker inside the modern Canada polygon.
- The world represents about 1.59 bn people, not the full 1.62 bn M2 estimate.
- The full world is compute-heavy; high speeds are explicitly best-effort.
- Native device builds were not re-verified for M11.


## Developer smoke entry points (web only)

The exported web build accepts two query parameters that are development aids,
not gameplay shortcuts:

- `?view=brief` opens the new-game scenario confirmation directly.
- `?view=select` opens the country picker directly.
- `?country=JPN` creates a campaign for that country through the normal
  validated `CREATE_GAME` path (unknown or non-selectable tags are ignored).

They are useful for automated browser smoke tests and screenshots.
