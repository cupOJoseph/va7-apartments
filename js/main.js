/**
 * District 8 Apartments — Main Entry Point
 *
 * Orchestrates initialization and exposes global handlers.
 */

'use strict';

const App = (() => {

  async function boot() {
    try {
      const { boundary } = await Store.loadAll();

      MapView.init(boundary);
      MapView.renderMarkers();

      TableView.populateFilters();
      TableView.render();
      TableView.bindEvents();

      _updateStats();
      _setupTabs();

      document.getElementById('loading').classList.add('hidden');

    } catch (err) {
      console.error('Boot failed:', err);
      document.getElementById('loading').innerHTML = `
        <h2 style="color:var(--danger)">Error Loading Dashboard</h2>
        <p>${esc(err.message)}</p>
      `;
    }
  }

  function handleStatusChange(idx, newStatus) {
    Store.updateStatus(idx, newStatus);

    MapView.renderMarkers();

    TableView.render();
    _updateStats();
  }

  // ── Private ───────────────────────────────────────────────────

  function _updateStats() {
    const stats = Store.getStats();
    document.getElementById('stat-total').textContent = stats.complexes;
    document.getElementById('stat-units').textContent = formatCompact(stats.units);
    document.getElementById('stat-voters').textContent = formatCompact(stats.voters);
    document.getElementById('stat-contacted').textContent = stats.contacted;
    document.getElementById('stat-canvassed').textContent = stats.canvassed;
  }

  function _setupTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'map') {
          setTimeout(() => MapView.invalidateSize(), 100);
        }
      });
    });
  }

  return { boot, handleStatusChange };
})();


// ── Global Function Bridges (called from HTML onclick) ────────

function updateStatus(idx, val) { App.handleStatusChange(idx, val); }
function resetFilters() { TableView.resetFilters(); }
function exportCSV() { TableView.exportCSV(); }


// ── Boot ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', App.boot);
