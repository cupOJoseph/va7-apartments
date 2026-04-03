/**
 * VA-7 Apartment Dashboard — Data Store
 *
 * Central state management for apartments, donor data, and SQL database.
 */

'use strict';

const Store = (() => {
  let _apartments = [];
  let _donorData = null;
  let _db = null;
  let _sortCol = 'name';
  let _sortDir = 1;

  // ── Data Loading ──────────────────────────────────────────────

  async function loadAll() {
    const [aptResp, boundaryResp] = await Promise.all([
      fetch(CONFIG.DATA.APARTMENTS),
      fetch(CONFIG.DATA.BOUNDARY),
    ]);

    _apartments = await aptResp.json();
    const boundary = await boundaryResp.json();

    _restoreStatuses();
    await _initSQL();

    return { apartments: _apartments, boundary };
  }

  async function loadDonors() {
    try {
      const resp = await fetch(CONFIG.DATA.DONORS);
      if (!resp.ok) return null;
      _donorData = await resp.json();
      if (!_donorData.donors || _donorData.donors.length === 0) {
        _donorData = null;
      }
      return _donorData;
    } catch {
      return null;
    }
  }

  // ── Apartments ────────────────────────────────────────────────

  function getApartments() {
    return _apartments;
  }

  function getFilteredApartments(filters) {
    const { search = '', area = '', region = '', type = '', status = '' } = filters;
    const q = search.toLowerCase();

    return _apartments.filter((apt) => {
      if (q && !`${apt.name} ${apt.address} ${apt.area} ${apt.notes}`.toLowerCase().includes(q)) return false;
      if (area && apt.area !== area) return false;
      if (region && apt.region !== region) return false;
      if (type && apt.type !== type) return false;
      if (status && apt.status !== status) return false;
      return true;
    });
  }

  function updateStatus(idx, newStatus) {
    _apartments[idx].status = newStatus;

    const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
    const key = _apartments[idx].name + '|' + _apartments[idx].address;
    saved[key] = newStatus;
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(saved));

    if (_db) {
      _db.run('UPDATE apartments SET status = ? WHERE name = ? AND address = ?', [
        newStatus, _apartments[idx].name, _apartments[idx].address,
      ]);
    }
  }

  function getStats() {
    const inDistrict = _apartments.filter((a) => a.in_district !== false);
    const totalUnits = inDistrict.reduce((sum, a) => sum + (a.est_units || 0), 0);
    const estVoters = Math.round(totalUnits * CONFIG.ADULTS_PER_UNIT * CONFIG.VOTER_REG_RATE);

    return {
      complexes: inDistrict.length,
      units: totalUnits,
      voters: estVoters,
      contacted: inDistrict.filter((a) => ['Contacted', 'Scheduled', 'Canvassed'].includes(a.status)).length,
      canvassed: inDistrict.filter((a) => a.status === 'Canvassed').length,
    };
  }

  function getUniqueAreas() {
    return [...new Set(_apartments.map((a) => a.area))].sort();
  }

  // ── Donors ────────────────────────────────────────────────────

  function getDonorData() {
    return _donorData;
  }

  function getDonorRecipients() {
    if (!_donorData) return [];
    const counts = {};
    _donorData.donors.forEach((d) => {
      const r = d.recipient || 'Unknown';
      counts[r] = (counts[r] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }

  function getDonorsByRecipient(recipient, searchQuery = '') {
    if (!_donorData) return [];
    const q = searchQuery.toLowerCase();
    return _donorData.donors.filter((d) => {
      if (d.recipient !== recipient) return false;
      if (q && !(d.name || '').toLowerCase().includes(q)
        && !(d.apartment || d.building || '').toLowerCase().includes(q)
        && !(d.employer || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function getDonorBuildingMap(recipient) {
    if (!_donorData) return {};
    const map = {};
    _donorData.donors.forEach((d) => {
      if (d.recipient !== recipient) return;
      const apt = d.apartment || d.building || 'Unknown';
      if (!map[apt]) map[apt] = [];
      map[apt].push(d);
    });
    return map;
  }

  // ── Sorting ───────────────────────────────────────────────────

  function getSort() {
    return { col: _sortCol, dir: _sortDir };
  }

  function toggleSort(col) {
    if (_sortCol === col) {
      _sortDir *= -1;
    } else {
      _sortCol = col;
      _sortDir = 1;
    }
  }

  function sortArray(arr) {
    return [...arr].sort((a, b) => {
      let va = a[_sortCol] ?? '';
      let vb = b[_sortCol] ?? '';
      if (_sortCol === 'est_units') {
        va = parseInt(va) || 0;
        vb = parseInt(vb) || 0;
      }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return va < vb ? -_sortDir : va > vb ? _sortDir : 0;
    });
  }

  // ── Private ───────────────────────────────────────────────────

  function _restoreStatuses() {
    const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
    _apartments.forEach((apt) => {
      const key = apt.name + '|' + apt.address;
      if (saved[key]) apt.status = saved[key];
    });
  }

  async function _initSQL() {
    const SQL = await initSqlJs({
      locateFile: (file) => `${CONFIG.SQLJS_CDN}/${file}`,
    });
    _db = new SQL.Database();

    _db.run(`
      CREATE TABLE IF NOT EXISTS apartments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, address TEXT, area TEXT, county TEXT, region TEXT,
        lat REAL, lng REAL, est_units INTEGER, type TEXT, community_room TEXT,
        contact_info TEXT, notes TEXT, status TEXT DEFAULT 'Not Contacted',
        in_district BOOLEAN DEFAULT 1, precinct TEXT
      )
    `);
    _db.run(`
      CREATE TABLE IF NOT EXISTS residents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, address TEXT, apartment_id INTEGER REFERENCES apartments(id),
        employer TEXT, occupation TEXT, contribution_amount REAL,
        contribution_date TEXT, recipient TEXT, party TEXT, fec_filing_id TEXT
      )
    `);
    _db.run('CREATE INDEX IF NOT EXISTS idx_res_apt ON residents(apartment_id)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_apt_area ON apartments(area)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_apt_status ON apartments(status)');

    _apartments.forEach((apt) => {
      _db.run(
        `INSERT INTO apartments (name,address,area,county,region,lat,lng,est_units,type,
         community_room,contact_info,notes,status,in_district,precinct)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [apt.name, apt.address, apt.area, apt.county, apt.region, apt.lat, apt.lng,
         apt.est_units, apt.type, apt.community_room, apt.contact_info || '',
         apt.notes, apt.status, apt.in_district ? 1 : 0, apt.precinct || ''],
      );
    });
  }

  // ── Public API ────────────────────────────────────────────────

  return {
    loadAll, loadDonors,
    getApartments, getFilteredApartments, updateStatus, getStats, getUniqueAreas,
    getDonorData, getDonorRecipients, getDonorsByRecipient, getDonorBuildingMap,
    getSort, toggleSort, sortArray,
  };
})();
