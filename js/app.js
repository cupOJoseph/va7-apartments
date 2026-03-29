/**
 * VA-7 Apartment Dashboard — Main App
 */

const App = (() => {
  let map, markerCluster;
  let currentSort = { col: 'name', dir: 'asc' };
  let markers = {};
  const statusColors = {
    'Not Contacted': '#e53e3e',
    'Contacted': '#d69e2e',
    'Scheduled': '#3182ce',
    'Canvassed': '#38a169',
    'Out of District': '#a0aec0'
  };
  const statusClasses = {
    'Not Contacted': 'status-not-contacted',
    'Contacted': 'status-contacted',
    'Scheduled': 'status-scheduled',
    'Canvassed': 'status-canvassed',
    'Out of District': 'status-out-of-district'
  };

  function initMap() {
    map = L.map('map', { zoomControl: true }).setView([38.82, -77.18], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    // Marker cluster
    markerCluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        let size = 'small';
        if (count > 20) size = 'large';
        else if (count > 10) size = 'medium';
        return L.divIcon({
          html: `<div class="cluster-icon cluster-${size}">${count}</div>`,
          className: 'marker-cluster-custom',
          iconSize: L.point(40, 40)
        });
      }
    });
    map.addLayer(markerCluster);

    // Load VA-7 boundary if available
    loadBoundary();
  }

  async function loadBoundary() {
    try {
      const resp = await fetch('data/va7-boundary.geojson');
      if (resp.ok) {
        const geoData = await resp.json();
        L.geoJSON(geoData, {
          style: { color: '#1a365d', weight: 2, fillColor: '#3182ce', fillOpacity: 0.06, dashArray: '6,4' }
        }).addTo(map).bindPopup('<b>VA-7 Congressional District</b><br>Approximate boundary');
      }
    } catch (e) { /* no boundary file, skip */ }
  }

  function createMarkerIcon(status) {
    const color = statusColors[status] || '#e53e3e';
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
  }

  function renderMap(apartments) {
    markerCluster.clearLayers();
    markers = {};

    apartments.forEach(a => {
      if (!a.lat || !a.lng) return;
      const m = L.marker([a.lat, a.lng], { icon: createMarkerIcon(a.status) });
      m.bindPopup(`
        <div class="popup-content">
          <h3>${esc(a.name)}</h3>
          <p>${esc(a.address)}</p>
          <p><b>${a.est_units}+ units</b> · ${esc(a.type)}</p>
          <p>Community Room: ${esc(a.community_room)}</p>
          ${a.contact_info ? `<p>📞 ${esc(a.contact_info)}</p>` : ''}
          <p>${esc(a.notes)}</p>
          <div class="popup-status">
            <select onchange="App.updateStatus(${a.id}, this.value)" class="popup-status-select">
              ${Object.keys(statusColors).map(s =>
                `<option value="${s}" ${a.status === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
          </div>
        </div>
      `);
      markerCluster.addLayer(m);
      markers[a.id] = m;
    });
  }

  function renderStats(apartments) {
    const stats = DB.getStats(apartments);
    document.getElementById('totalBuildingsBadge').textContent = `${stats.buildings} Buildings`;
    document.getElementById('totalUnitsBadge').textContent = `${stats.totalUnits.toLocaleString()}+ Units`;

    document.getElementById('statsBar').innerHTML = `
      <div class="stat-card"><div class="value">${stats.buildings}</div><div class="label">In-District</div></div>
      <div class="stat-card"><div class="value">${stats.totalUnits.toLocaleString()}+</div><div class="label">Est. Units</div></div>
      <div class="stat-card"><div class="value">${stats.areas}</div><div class="label">Areas</div></div>
      <div class="stat-card"><div class="value" style="color:#e53e3e">${stats.notContacted}</div><div class="label">Not Contacted</div></div>
      <div class="stat-card"><div class="value" style="color:#d69e2e">${stats.contacted}</div><div class="label">Contacted</div></div>
      <div class="stat-card"><div class="value" style="color:#3182ce">${stats.scheduled}</div><div class="label">Scheduled</div></div>
      <div class="stat-card"><div class="value" style="color:#38a169">${stats.canvassed}</div><div class="label">Canvassed</div></div>
      <div class="stat-card"><div class="value">${stats.nova} / ${stats.central}</div><div class="label">NoVA / Central</div></div>
    `;
  }

  function renderTable(apartments) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = apartments.map(a => `
      <tr data-id="${a.id}" class="${a.status === 'Out of District' ? 'row-ood' : ''}">
        <td><b>${esc(a.name)}</b></td>
        <td>${esc(a.address)}</td>
        <td>
          ${esc(a.area)}
          ${a.region === 'central' ? '<span class="region-tag central">Central VA</span>' : ''}
        </td>
        <td class="text-right"><b>${a.est_units}+</b></td>
        <td>${esc(a.type)}</td>
        <td>${esc(a.community_room)}</td>
        <td class="notes-cell">${esc(a.notes)}</td>
        <td>
          <select class="status-select ${statusClasses[a.status] || ''}" onchange="App.updateStatus(${a.id}, this.value)">
            ${Object.keys(statusColors).map(s =>
              `<option value="${s}" ${a.status === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
        </td>
      </tr>
    `).join('');
  }

  function getFilters() {
    return {
      search: document.getElementById('searchInput').value,
      area: document.getElementById('areaFilter').value,
      status: document.getElementById('statusFilter').value,
      type: document.getElementById('typeFilter').value,
      region: document.getElementById('regionFilter').value,
      orderBy: currentSort.col === 'units' ? 'est_units' : currentSort.col,
      orderDir: currentSort.dir
    };
  }

  function render() {
    const apartments = DB.getAll(getFilters());
    renderStats(apartments);
    renderMap(apartments);
    renderTable(apartments);
  }

  function populateFilters() {
    const areas = DB.getAreas();
    const types = DB.getTypes();
    const areaEl = document.getElementById('areaFilter');
    const typeEl = document.getElementById('typeFilter');

    areas.forEach(a => {
      const o = document.createElement('option');
      o.value = a; o.textContent = a;
      areaEl.appendChild(o);
    });
    types.forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      typeEl.appendChild(o);
    });
  }

  function setupEvents() {
    // Filter change
    ['searchInput'].forEach(id => {
      document.getElementById(id).addEventListener('input', debounce(render, 200));
    });
    ['areaFilter', 'statusFilter', 'typeFilter', 'regionFilter'].forEach(id => {
      document.getElementById(id).addEventListener('change', render);
    });

    // Sort
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (currentSort.col === col) {
          currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.col = col;
          currentSort.dir = 'asc';
        }
        document.querySelectorAll('th .sort-arrow').forEach(s => s.textContent = '');
        th.querySelector('.sort-arrow').textContent = currentSort.dir === 'asc' ? ' ▲' : ' ▼';
        render();
      });
    });

    // Export CSV
    document.getElementById('exportBtn').addEventListener('click', () => {
      const csv = DB.exportCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `va7-apartments-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Print view
    document.getElementById('printBtn').addEventListener('click', () => {
      window.print();
    });

    // SQL query
    document.getElementById('sqlRunBtn').addEventListener('click', runSQL);
    document.getElementById('sqlInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runSQL();
    });

    // Toggle SQL panel
    document.getElementById('sqlToggle').addEventListener('click', () => {
      document.getElementById('sqlPanel').classList.toggle('hidden');
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'mapTab') {
          setTimeout(() => map.invalidateSize(), 100);
        }
      });
    });
  }

  function runSQL() {
    const sql = document.getElementById('sqlInput').value.trim();
    const resultsEl = document.getElementById('sqlResults');
    if (!sql) return;

    try {
      const results = DB.query(sql);
      if (!results.length) {
        resultsEl.innerHTML = '<p class="sql-info">Query executed. No results returned.</p>';
        render(); // Refresh in case of UPDATE/INSERT
        return;
      }
      const { columns, values } = results[0];
      let html = `<p class="sql-info">${values.length} row${values.length !== 1 ? 's' : ''}</p>`;
      html += '<div class="sql-table-wrap"><table class="sql-table"><thead><tr>';
      columns.forEach(c => html += `<th>${esc(c)}</th>`);
      html += '</tr></thead><tbody>';
      values.slice(0, 500).forEach(row => {
        html += '<tr>';
        row.forEach(v => html += `<td>${v === null ? '<em>NULL</em>' : esc(String(v))}</td>`);
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      if (values.length > 500) html += `<p class="sql-info">Showing first 500 of ${values.length} rows</p>`;
      resultsEl.innerHTML = html;
    } catch (e) {
      resultsEl.innerHTML = `<p class="sql-error">Error: ${esc(e.message)}</p>`;
    }
  }

  function updateStatus(id, status) {
    DB.saveStatus(id, status);
    render();
  }

  function esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  async function boot() {
    document.getElementById('loadingOverlay').style.display = 'flex';
    try {
      await DB.init();
      const resp = await fetch('data/apartments.json');
      const data = await resp.json();
      DB.loadApartments(data);
      DB.applyLocalStatuses();

      initMap();
      populateFilters();
      setupEvents();
      render();

      // Sync timestamp
      const ts = localStorage.getItem('va7_lastSync') || 'Never';
      document.getElementById('syncTime').textContent = ts;
    } catch (err) {
      console.error('Boot failed:', err);
      document.getElementById('loadingOverlay').innerHTML = `<div class="loading-content"><h2>Error Loading Dashboard</h2><p>${err.message}</p><p>Try refreshing the page.</p></div>`;
      return;
    }
    document.getElementById('loadingOverlay').style.display = 'none';
  }

  return { boot, render, updateStatus };
})();

document.addEventListener('DOMContentLoaded', App.boot);
