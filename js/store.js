/**
 * VA-7 Apartment Dashboard — Data Store
 *
 * Loads pre-built SQLite database and provides query interface.
 * Falls back to JSON if .db file unavailable.
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
    // Init sql.js
    const SQL = await initSqlJs({
      locateFile: (file) => `${CONFIG.SQLJS_CDN}/${file}`,
    });

    // Try loading pre-built DB, fall back to JSON
    let boundary;
    try {
      const [dbResp, boundaryResp] = await Promise.all([
        fetch(CONFIG.DATA.DATABASE),
        fetch(CONFIG.DATA.BOUNDARY),
      ]);

      if (dbResp.ok) {
        const buf = await dbResp.arrayBuffer();
        _db = new SQL.Database(new Uint8Array(buf));
        _apartments = _queryApartments();
        console.log(`✅ Loaded DB: ${_apartments.length} apartments`);
      } else {
        throw new Error('DB not found, falling back to JSON');
      }

      boundary = await boundaryResp.json();
    } catch (e) {
      console.warn('DB load failed, using JSON fallback:', e.message);
      const [aptResp, boundaryResp] = await Promise.all([
        fetch(CONFIG.DATA.APARTMENTS),
        fetch(CONFIG.DATA.BOUNDARY),
      ]);
      _apartments = await aptResp.json();
      boundary = await boundaryResp.json();

      // Build in-memory DB from JSON
      _db = new SQL.Database();
      _createSchema();
      _insertApartmentsFromJSON();
    }

    _restoreStatuses();

    return { apartments: _apartments, boundary };
  }

  async function loadDonors() {
    // If DB has donors, use those
    if (_db) {
      try {
        const result = _db.exec('SELECT COUNT(*) FROM donors');
        const count = result[0]?.values[0][0] || 0;
        if (count > 0) {
          _donorData = { donors: _queryDonors() };
          return _donorData;
        }
      } catch { /* table may not exist in JSON fallback */ }
    }

    // Otherwise load from JSON
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

    // Persist to localStorage
    const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
    const key = _apartments[idx].name + '|' + _apartments[idx].address;
    saved[key] = newStatus;
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(saved));

    // Update in-memory DB
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

  // ── Raw SQL (for advanced users / SQL tab) ────────────────────

  function query(sql) {
    if (!_db) throw new Error('Database not loaded');
    return _db.exec(sql);
  }

  // ── Private: DB Queries ───────────────────────────────────────

  function _queryApartments() {
    const results = _db.exec('SELECT * FROM apartments ORDER BY name');
    if (!results.length) return [];
    const cols = results[0].columns;
    return results[0].values.map((row) => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      obj.in_district = obj.in_district !== 0;
      obj.verified = obj.verified !== 0;
      return obj;
    });
  }

  function _queryDonors() {
    const results = _db.exec('SELECT * FROM donors ORDER BY total_amount DESC');
    if (!results.length) return [];
    const cols = results[0].columns;
    return results[0].values.map((row) => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      obj.in_va7 = obj.in_va7 !== 0;
      return obj;
    });
  }

  // ── Private: Status Restore ───────────────────────────────────

  function _restoreStatuses() {
    const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
    _apartments.forEach((apt) => {
      const key = apt.name + '|' + apt.address;
      if (saved[key]) apt.status = saved[key];
    });
  }

  // ── Private: JSON Fallback Schema ─────────────────────────────

  function _createSchema() {
    _db.run(`
      CREATE TABLE IF NOT EXISTS apartments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, address TEXT, area TEXT, county TEXT, region TEXT,
        lat REAL, lng REAL, est_units INTEGER, type TEXT, community_room TEXT,
        contact_info TEXT, notes TEXT, status TEXT DEFAULT 'Not Contacted',
        source TEXT, verified INTEGER DEFAULT 0, in_district INTEGER DEFAULT 1, precinct TEXT
      )
    `);
  }

  function _insertApartmentsFromJSON() {
    _apartments.forEach((apt) => {
      _db.run(
        `INSERT INTO apartments (name,address,area,county,region,lat,lng,est_units,type,
         community_room,contact_info,notes,status,source,verified,in_district,precinct)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [apt.name, apt.address, apt.area, apt.county, apt.region, apt.lat, apt.lng,
         apt.est_units, apt.type, apt.community_room, apt.contact_info || '',
         apt.notes, apt.status, apt.source || '', apt.verified ? 1 : 0,
         apt.in_district === false ? 0 : 1, apt.precinct || ''],
      );
    });
  }

  // ── Public API ────────────────────────────────────────────────

  return {
    loadAll, loadDonors, query,
    getApartments, getFilteredApartments, updateStatus, getStats, getUniqueAreas,
    getDonorData, getDonorRecipients, getDonorsByRecipient, getDonorBuildingMap,
    getSort, toggleSort, sortArray,
  };
})();
