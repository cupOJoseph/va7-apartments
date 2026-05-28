# District 8 Apartments

Apartment map and sortable building list for Virginia's current 8th Congressional District.

## Features

- **🗺️ Map** — Interactive Leaflet map with clustered markers and current VA-8 district boundary overlay
- **📋 List** — Sortable, filterable table of apartment buildings with search and CSV export

## Tech Stack

- Single-page app, no build step required
- [Leaflet.js](https://leafletjs.com/) + [MarkerCluster](https://github.com/Leaflet/Leaflet.markercluster) for mapping
- [sql.js](https://sql.js.org/) (WASM SQLite) for in-browser database
- District boundary from the current U.S. Census/TIGER congressional district geometry
- Status persistence via localStorage

## Data

- `data/apartments.json` — apartment buildings inside VA-8 with source metadata and estimated unit counts
- `data/va8-boundary.geojson` — current VA-8 district boundary polygon

## District Coverage

Current VA-8 portions of Arlington, Alexandria, Falls Church City, and adjacent Fairfax County areas.

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
