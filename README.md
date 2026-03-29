# VA-7 Apartment Dashboard

Campaign canvassing tool for Virginia's new 7th Congressional District.

## Features

- **🗺️ Map** — Interactive Leaflet map with clustered markers, VA-7 district boundary overlay, color-coded by canvassing status
- **📋 List** — Sortable, filterable table of all apartment complexes with inline status updates, search, and CSV export
- **👥 Residents** — FEC contribution data tab (schema ready, awaiting data import)

## Tech Stack

- Single-page app, no build step required
- [Leaflet.js](https://leafletjs.com/) + [MarkerCluster](https://github.com/Leaflet/Leaflet.markercluster) for mapping
- [sql.js](https://sql.js.org/) (WASM SQLite) for in-browser database
- District boundary from official proposed redistricting GeoJSON
- Status persistence via localStorage

## Data

- `data/apartments.json` — 300+ apartment complexes with geocoded coordinates
- `data/va7-boundary.geojson` — VA-7 district boundary polygon

## District Coverage

**Northern Virginia:** Arlington (Ballston, Rosslyn, Clarendon, Cherrydale, East Falls Church), Falls Church City, Fairfax County (Springfield, Annandale, Burke, Seven Corners, Woodburn, Lake Barcroft, Kings Park, Ravensworth, Dunn Loring)

**Central Virginia:** Culpeper, Orange, Louisa, Madison, Greene, Goochland, Powhatan, Rockingham (partial), Augusta (partial)

## Development

Just open `index.html` in a browser. No server needed — everything loads from CDN and local JSON files.

For local development with live reload:
```bash
npx serve .
```

## CI/CD

- **CI** runs on pull requests to `main` — validates HTML, JSON schema, GeoJSON, and CDN availability
- **Deploy** runs on push to `main` — deploys to GitHub Pages automatically

## License

Campaign internal tool. Not for public distribution.
