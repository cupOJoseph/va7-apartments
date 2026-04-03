/**
 * VA-7 Apartment Dashboard — Table & Filter Module
 */

'use strict';

const TableView = (() => {

  function render() {
    const filters = _readFilters();
    const filtered = Store.getFilteredApartments(filters);
    const sorted = Store.sortArray(filtered);
    const apartments = Store.getApartments();

    const tbody = document.getElementById('apt-table-body');
    tbody.innerHTML = sorted.map((apt) => {
      const idx = apartments.indexOf(apt);
      const rowClass = '';
      const srcLink = safeUrl(apt.source);
      const statusOptions = CONFIG.STATUSES.map(
        (s) => `<option value="${s}" ${apt.status === s ? 'selected' : ''}>${s}</option>`
      ).join('');

      return `<tr class="${rowClass}">
        <td><strong>${esc(apt.name)}</strong></td>
        <td>${esc(apt.address)}</td>
        <td>${esc(apt.area)}</td>
        <td>${esc(apt.region)}</td>
        <td>${esc(apt.est_units) || '?'}</td>
        <td>${esc(apt.type) || '?'}</td>
        <td>${esc(apt.community_room) || '?'}</td>
        <td>
          <select class="status-select" onchange="App.handleStatusChange(${idx}, this.value)">
            ${statusOptions}
          </select>
        </td>
        <td>${esc(apt.notes)}</td>
        <td>${srcLink ? `<a href="${srcLink}" target="_blank" rel="noopener noreferrer" style="color:#3182ce">🔗</a>` : ''} ${apt.verified ? '✓' : ''}</td>
      </tr>`;
    }).join('');

    document.getElementById('list-count').textContent = filtered.length;
  }

  function populateFilters() {
    const areaSelect = document.getElementById('filter-area');
    Store.getUniqueAreas().forEach((area) => {
      const opt = document.createElement('option');
      opt.value = area;
      opt.textContent = area;
      areaSelect.appendChild(opt);
    });

    const resAptSelect = document.getElementById('resident-filter-apt');
    Store.getApartments()
      .filter((a) => a.in_district !== false && a.in_district !== 0)
      .forEach((apt) => {
        const opt = document.createElement('option');
        opt.value = apt.name;
        opt.textContent = apt.name;
        resAptSelect.appendChild(opt);
      });
  }

  function bindEvents() {
    ['search', 'filter-area', 'filter-region', 'filter-type', 'filter-status'].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener(id === 'search' ? 'input' : 'change', render);
    });

    document.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        Store.toggleSort(th.dataset.sort);
        render();
      });
    });
  }

  function resetFilters() {
    ['search', 'filter-area', 'filter-region', 'filter-type', 'filter-status'].forEach((id) => {
      document.getElementById(id).value = '';
    });
    render();
  }

  function exportCSV() {
    const filters = _readFilters();
    const filtered = Store.getFilteredApartments(filters);
    const headers = [
      'Name', 'Address', 'Area', 'County', 'Region', 'Lat', 'Lng',
      'Est Units', 'Type', 'Community Room', 'Contact', 'Notes', 'Status', 'In District',
    ];
    const rows = filtered.map((a) => [
      a.name, a.address, a.area, a.county, a.region, a.lat, a.lng,
      a.est_units, a.type, a.community_room, a.contact_info, a.notes,
      a.status, a.in_district,
    ]);
    downloadFile('va7-apartments.csv', toCSV(headers, rows), 'text/csv');
  }

  // ── Private ───────────────────────────────────────────────────

  function _readFilters() {
    return {
      search: document.getElementById('search').value,
      area: document.getElementById('filter-area').value,
      region: document.getElementById('filter-region').value,
      type: document.getElementById('filter-type').value,
      status: document.getElementById('filter-status').value,
    };
  }

  return { render, populateFilters, bindEvents, resetFilters, exportCSV };
})();
