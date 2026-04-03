/**
 * VA-7 Apartment Dashboard — Configuration & Constants
 */

'use strict';

const CONFIG = Object.freeze({
  // Voter estimation parameters (VA multifamily averages)
  ADULTS_PER_UNIT: 1.7,
  VOTER_REG_RATE: 0.65,

  // Map defaults
  MAP_CENTER: [38.5, -78.0],
  MAP_ZOOM: 8,
  MAP_MAX_ZOOM: 19,
  TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  TILE_ATTRIBUTION: '© OpenStreetMap contributors',

  // Cluster settings
  CLUSTER_MAX_RADIUS: 50,

  // Status colors for apartment tracking
  STATUS_COLORS: {
    'Not Contacted': '#a0aec0',
    'Contacted': '#4299e1',
    'Scheduled': '#ecc94b',
    'Canvassed': '#48bb78',
    'Declined': '#fc8181',
  },

  // Donor highlight color
  DONOR_HIGHLIGHT_COLOR: '#d69e2e',
  OUT_OF_DISTRICT_COLOR: '#9b2c2c',

  // All valid statuses (order matters for dropdowns)
  STATUSES: ['Not Contacted', 'Contacted', 'Scheduled', 'Canvassed', 'Declined'],

  // Data paths
  DATA: {
    APARTMENTS: 'data/apartments.json',
    BOUNDARY: 'data/va7-boundary.geojson',
    DONORS: 'data/donors.json',
  },

  // Local storage keys
  STORAGE_KEY: 'va7-apt-statuses',

  // SQL.js CDN
  SQLJS_CDN: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3',
});
