/**
 * VA-7 Apartment Dashboard — Map Module
 */

'use strict';

const MapView = (() => {
  let _map = null;
  let _clusterGroup = null;
  let _districtLayer = null;

  function init(boundary) {
    _map = L.map('map').setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);

    L.tileLayer(CONFIG.TILE_URL, {
      attribution: CONFIG.TILE_ATTRIBUTION,
      maxZoom: CONFIG.MAP_MAX_ZOOM,
    }).addTo(_map);

    _districtLayer = L.geoJSON(boundary, {
      style: {
        color: '#1a365d',
        weight: 3,
        fillColor: '#2b6cb0',
        fillOpacity: 0.08,
        dashArray: '8 4',
      },
    }).addTo(_map);

    _clusterGroup = L.markerClusterGroup({
      maxClusterRadius: CONFIG.CLUSTER_MAX_RADIUS,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: _createClusterIcon,
    });

    _map.addLayer(_clusterGroup);
    _map.fitBounds(_districtLayer.getBounds(), { padding: [20, 20] });
    _addLegend();
  }

  function invalidateSize() {
    if (_map) _map.invalidateSize();
  }

  // ── Markers ───────────────────────────────────────────────────

  function renderMarkers(onStatusChange) {
    _clusterGroup.clearLayers();
    const apartments = Store.getApartments();

    apartments.forEach((apt, idx) => {
      if (!apt.lat || !apt.lng) return;

      const color = apt.in_district === false
        ? CONFIG.OUT_OF_DISTRICT_COLOR
        : (CONFIG.STATUS_COLORS[apt.status] || '#a0aec0');

      const marker = L.marker([apt.lat, apt.lng], {
        icon: _createMarkerIcon(color, 12),
      });

      marker.bindPopup(_buildPopup(apt, idx));
      _clusterGroup.addLayer(marker);
    });
  }

  function renderDonorMarkers(recipient, donorBuildingMap, onStatusChange) {
    _clusterGroup.clearLayers();
    const apartments = Store.getApartments();
    const matchedNames = new Set(Object.keys(donorBuildingMap));

    apartments.forEach((apt, idx) => {
      if (!apt.lat || !apt.lng) return;

      const isDonor = matchedNames.has(apt.name);
      const color = isDonor ? CONFIG.DONOR_HIGHLIGHT_COLOR : (CONFIG.STATUS_COLORS[apt.status] || '#a0aec0');
      const size = isDonor ? 18 : 12;
      const animate = isDonor;

      const marker = L.marker([apt.lat, apt.lng], {
        icon: _createMarkerIcon(color, size, animate),
      });

      const donorCount = donorBuildingMap[apt.name]?.length || 0;
      const donorInfo = isDonor
        ? `<div class="popup-detail" style="color:${CONFIG.DONOR_HIGHLIGHT_COLOR};font-weight:700;margin-top:6px">🎯 ${donorCount} donor${donorCount !== 1 ? 's' : ''} to ${esc(recipient)}</div>`
        : '';

      marker.bindPopup(`
        <div class="popup-title">${esc(apt.name)}</div>
        <div class="popup-detail"><strong>Address:</strong> ${esc(apt.address)}</div>
        <div class="popup-detail"><strong>Est. Units:</strong> ${esc(apt.est_units) || 'Unknown'}</div>
        ${donorInfo}
      `);

      _clusterGroup.addLayer(marker);
    });
  }

  // ── Private Helpers ───────────────────────────────────────────

  function _createMarkerIcon(color, size, animate = false) {
    const animStyle = animate ? 'animation:donor-pulse 1.5s infinite;' : '';
    return L.divIcon({
      html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);${animStyle}"></div>`,
      className: '',
      iconSize: [size + 4, size + 4],
      iconAnchor: [(size + 4) / 2, (size + 4) / 2],
    });
  }

  function _createClusterIcon(cluster) {
    const count = cluster.getChildCount();
    const size = count > 50 ? 50 : count > 20 ? 40 : 30;
    const fontSize = count > 50 ? 14 : count > 20 ? 12 : 11;
    return L.divIcon({
      html: `<div style="background:var(--primary);color:white;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${fontSize}px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${count}</div>`,
      className: 'marker-cluster',
      iconSize: L.point(size, size),
    });
  }

  function _buildPopup(apt, idx) {
    const srcUrl = safeUrl(apt.source);
    const statusOptions = CONFIG.STATUSES.map(
      (s) => `<option value="${s}" ${apt.status === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    return `
      <div class="popup-title">${esc(apt.name)}</div>
      <div class="popup-detail"><strong>Address:</strong> ${esc(apt.address)}</div>
      <div class="popup-detail"><strong>Area:</strong> ${esc(apt.area)} (${esc(apt.region)})</div>
      <div class="popup-detail"><strong>Est. Units:</strong> ${esc(apt.est_units) || 'Unknown'}</div>
      <div class="popup-detail"><strong>Type:</strong> ${esc(apt.type) || 'Unknown'}</div>
      <div class="popup-detail"><strong>Community Room:</strong> ${esc(apt.community_room) || 'Unknown'}</div>
      ${apt.contact_info ? `<div class="popup-detail"><strong>Contact:</strong> ${esc(apt.contact_info)}</div>` : ''}
      ${apt.notes ? `<div class="popup-detail"><strong>Notes:</strong> ${esc(apt.notes)}</div>` : ''}
      ${srcUrl ? `<div class="popup-detail"><a href="${srcUrl}" target="_blank" rel="noopener noreferrer" style="color:#3182ce;text-decoration:none">🔗 Verification Source</a></div>` : ''}
      ${apt.verified ? '<div class="popup-detail" style="color:#38a169;font-weight:600">✓ Verified</div>' : ''}
      <div class="popup-detail" style="margin-top:8px">
        <strong>Status:</strong>
        <select class="status-select" onchange="App.handleStatusChange(${idx}, this.value)">
          ${statusOptions}
        </select>
      </div>
      ${apt.in_district === false ? '<div class="popup-detail" style="color:#e53e3e;font-weight:700;margin-top:6px">⚠️ OUT OF DISTRICT</div>' : ''}
    `;
  }

  function _addLegend() {
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = '<strong style="margin-bottom:6px;display:block">Status</strong>';
      Object.entries(CONFIG.STATUS_COLORS).forEach(([status, color]) => {
        div.innerHTML += `<div class="legend-item"><div class="legend-dot" style="background:${color}"></div>${status}</div>`;
      });
      div.innerHTML += `<div class="legend-item"><div class="legend-dot" style="background:${CONFIG.OUT_OF_DISTRICT_COLOR}"></div>Out of District</div>`;
      return div;
    };
    legend.addTo(_map);
  }

  return { init, invalidateSize, renderMarkers, renderDonorMarkers };
})();
