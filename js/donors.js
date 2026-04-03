/**
 * VA-7 Apartment Dashboard — Donor Module
 *
 * Handles donor filtering, panel UI, CSV export, and contact search.
 */

'use strict';

const Donors = (() => {
  let _activeRecipient = null;

  function init() {
    const data = Store.getDonorData();
    if (!data) return;

    document.getElementById('donor-filter-bar').style.display = 'flex';

    _populateRecipientDropdown();
    _bindEvents();
  }

  function getActiveRecipient() {
    return _activeRecipient;
  }

  // ── Filter Actions ────────────────────────────────────────────

  function applyFilter() {
    const recipient = document.getElementById('donor-recipient-filter').value;
    if (!recipient) {
      clearFilter();
      return;
    }

    _activeRecipient = recipient;
    const buildingMap = Store.getDonorBuildingMap(recipient);
    MapView.renderDonorMarkers(recipient, buildingMap);

    const totalDonors = Object.values(buildingMap).reduce((s, arr) => s + arr.length, 0);
    const buildingCount = Object.keys(buildingMap).length;
    document.getElementById('donor-count-badge').textContent =
      `${totalDonors} donors across ${buildingCount} buildings`;
  }

  function clearFilter() {
    _activeRecipient = null;
    document.getElementById('donor-recipient-filter').value = '';
    document.getElementById('donor-search').value = '';
    document.getElementById('donor-count-badge').textContent = '';
    MapView.renderMarkers();
    closePanel();
  }

  // ── Panel ─────────────────────────────────────────────────────

  function openPanel() {
    _renderPanel();
    document.getElementById('donor-panel').classList.add('open');
    document.getElementById('donor-overlay').classList.add('open');
  }

  function closePanel() {
    document.getElementById('donor-panel').classList.remove('open');
    document.getElementById('donor-overlay').classList.remove('open');
  }

  function _renderPanel() {
    const donors = _getFilteredDonors();
    const tbody = document.getElementById('donor-list-body');

    document.getElementById('donor-panel-title').textContent =
      `${_activeRecipient || 'All'} Donors (${donors.length})`;

    tbody.innerHTML = donors.map((d) => `
      <tr>
        <td><strong>${esc(d.name)}</strong></td>
        <td>${esc(d.apartment || d.building || '—')}</td>
        <td>${esc(d.employer || '—')}</td>
        <td>$${formatNumber(d.total_amount || d.amount || 0)}</td>
        <td>${d.num_contributions || 1}</td>
      </tr>
    `).join('');

    const total = donors.reduce((s, d) => s + (d.total_amount || d.amount || 0), 0);
    document.getElementById('donor-panel-footer').textContent =
      `${donors.length} donors · $${formatNumber(total)} total contributions`;
  }

  // ── Export ────────────────────────────────────────────────────

  function exportCSV() {
    const donors = _getFilteredDonors();
    const headers = ['Name', 'City', 'Zip', 'Employer', 'Occupation', 'Total Amount', '# Contributions', 'Last Date'];
    const rows = donors.map((d) => [
      d.name, d.city || '', d.zip || '',
      d.employer || '', d.occupation || '',
      d.total_amount || d.amount || 0, d.num_contributions || 1, d.date || '',
    ]);
    const safeName = (_activeRecipient || 'all').replace(/[^a-z0-9]/gi, '_');
    downloadFile(`donors-${safeName}.csv`, toCSV(headers, rows), 'text/csv');
  }

  // ── Contact Search ────────────────────────────────────────────

  function searchContacts() {
    const donors = _getFilteredDonors();
    if (!donors.length) {
      alert('No donors to search.');
      return;
    }

    const uniqueNames = [...new Set(donors.map((d) => d.name).filter(Boolean))];
    const recipientLabel = esc(_activeRecipient || 'All');

    const tableRows = donors.map((d) => {
      const name = esc(d.name || '');
      const building = esc(d.apartment || d.building || '');
      const q = encodeURIComponent(d.name || '');
      return `<tr>
        <td><strong>${name}</strong></td>
        <td>${building}</td>
        <td class="search-links">
          <a href="https://www.linkedin.com/search/results/all/?keywords=${q}" target="_blank">LinkedIn</a>
          <a href="https://www.google.com/search?q=${q}+virginia+email+OR+phone" target="_blank">Google</a>
          <a href="https://www.truepeoplesearch.com/results?name=${q}&citystatezip=Virginia" target="_blank">TruePeople</a>
        </td>
      </tr>`;
    }).join('');

    const namesJSON = JSON.stringify(uniqueNames);
    const html = [
      '<!DOCTYPE html><html><head>',
      `<title>Donor Contact Search — ${recipientLabel}</title>`,
      '<style>',
      'body{font-family:-apple-system,sans-serif;max-width:900px;margin:40px auto;padding:0 20px}',
      'h1{color:#1a365d}h2{color:#2b6cb0;margin-top:24px}',
      'table{width:100%;border-collapse:collapse;margin:16px 0}',
      'th{background:#1a365d;color:white;padding:8px 12px;text-align:left}',
      'td{padding:8px 12px;border-bottom:1px solid #e2e8f0}',
      '.search-links a{display:inline-block;margin:4px 8px 4px 0;padding:4px 12px;background:#edf2f7;border-radius:4px;text-decoration:none;color:#2b6cb0;font-size:.85rem}',
      '.search-links a:hover{background:#bee3f8}',
      '.btn{padding:8px 16px;background:#1a365d;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;margin:4px}',
      '.btn:hover{background:#2b6cb0}.copy-btn{background:#38a169}',
      '</style></head><body>',
      '<h1>🔍 Donor Contact Search</h1>',
      `<p>${uniqueNames.length} unique donors to <strong>${recipientLabel}</strong> in VA-7.</p>`,
      '<p><button class="btn copy-btn" onclick="copyAll()">📋 Copy All Names</button>',
      '<button class="btn" onclick="openAllLinkedIn()">🔗 Open All in LinkedIn</button></p>',
      '<h2>Individual Search Links</h2>',
      '<table><thead><tr><th>Name</th><th>Building</th><th>Search</th></tr></thead><tbody>',
      tableRows,
      '</tbody></table>',
      `<scr${'ipt'}>`,
      `var _names=${namesJSON};`,
      'function copyAll(){navigator.clipboard.writeText(_names.join("\\n")).then(function(){alert("Copied "+_names.length+" names!")})}',
      'function openAllLinkedIn(){if(!confirm("Open LinkedIn for all "+_names.length+" donors?"))return;_names.forEach(function(n){window.open("https://www.linkedin.com/search/results/all/?keywords="+encodeURIComponent(n))})}',
      `</scr${'ipt'}>`,
      '</body></html>',
    ].join('\n');

    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  // ── Private ───────────────────────────────────────────────────

  function _getFilteredDonors() {
    if (!_activeRecipient) return [];
    const search = (document.getElementById('donor-search').value || '').toLowerCase();
    return Store.getDonorsByRecipient(_activeRecipient, search);
  }

  function _populateRecipientDropdown() {
    const select = document.getElementById('donor-recipient-filter');
    Store.getDonorRecipients().forEach(({ name, count }) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${name} (${count} donors)`;
      select.appendChild(opt);
    });
  }

  function _bindEvents() {
    document.getElementById('donor-recipient-filter').addEventListener('change', applyFilter);
    document.getElementById('donor-search').addEventListener('input',
      debounce(() => { if (_activeRecipient) _renderPanel(); }, 300));
  }

  return { init, getActiveRecipient, applyFilter, clearFilter, openPanel, closePanel, exportCSV, searchContacts };
})();
