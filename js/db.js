/**
 * VA-7 Apartment Dashboard — sql.js Database Module
 * SQLite compiled to WASM, runs entirely in the browser.
 */

const DB = (() => {
  let db = null;
  let SQL = null;

  async function init() {
    SQL = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
    });
    db = new SQL.Database();

    db.run(`
      CREATE TABLE apartments (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        area TEXT,
        lat REAL,
        lng REAL,
        est_units INTEGER,
        type TEXT,
        community_room TEXT,
        contact_info TEXT,
        notes TEXT,
        status TEXT DEFAULT 'Not Contacted',
        region TEXT,
        county TEXT,
        precinct TEXT
      );
    `);

    db.run(`
      CREATE TABLE election_data (
        precinct TEXT PRIMARY KEY,
        county TEXT,
        registered_voters INTEGER,
        dem_pct REAL,
        rep_pct REAL,
        turnout_2024 REAL,
        notes TEXT
      );
    `);

    // Indexes for common queries
    db.run(`CREATE INDEX idx_apartments_area ON apartments(area);`);
    db.run(`CREATE INDEX idx_apartments_region ON apartments(region);`);
    db.run(`CREATE INDEX idx_apartments_status ON apartments(status);`);
    db.run(`CREATE INDEX idx_apartments_county ON apartments(county);`);

    return db;
  }

  function loadApartments(data) {
    const stmt = db.prepare(`
      INSERT INTO apartments (id, name, address, area, lat, lng, est_units, type, community_room, contact_info, notes, status, region, county)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    data.forEach((a, i) => {
      stmt.run([
        i + 1, a.name, a.address, a.area, a.lat || null, a.lng || null,
        a.units || a.est_units || 0, a.type, a.communityRoom || a.community_room || 'Unknown',
        a.contactInfo || a.contact_info || '', a.notes || '',
        a.status || 'Not Contacted', a.region || 'nova', a.county || ''
      ]);
    });
    stmt.free();
  }

  function applyLocalStatuses() {
    try {
      const saved = JSON.parse(localStorage.getItem('va7_statuses') || '{}');
      Object.entries(saved).forEach(([id, status]) => {
        db.run('UPDATE apartments SET status = ? WHERE id = ?', [status, parseInt(id)]);
      });
    } catch (e) { /* ignore */ }
  }

  function saveStatus(id, status) {
    db.run('UPDATE apartments SET status = ? WHERE id = ?', [status, id]);
    try {
      const saved = JSON.parse(localStorage.getItem('va7_statuses') || '{}');
      saved[id] = status;
      localStorage.setItem('va7_statuses', JSON.stringify(saved));
    } catch (e) { /* ignore */ }
  }

  function query(sql) {
    return db.exec(sql);
  }

  function getAll(filters = {}) {
    let where = [];
    let params = [];

    if (filters.search) {
      where.push(`(LOWER(name) LIKE ? OR LOWER(address) LIKE ? OR LOWER(area) LIKE ?)`);
      const s = `%${filters.search.toLowerCase()}%`;
      params.push(s, s, s);
    }
    if (filters.area) { where.push('area = ?'); params.push(filters.area); }
    if (filters.status) { where.push('status = ?'); params.push(filters.status); }
    if (filters.type) { where.push('type = ?'); params.push(filters.type); }
    if (filters.region) { where.push('region = ?'); params.push(filters.region); }
    if (filters.county) { where.push('county = ?'); params.push(filters.county); }
    if (filters.hideOutOfDistrict) { where.push("status != 'Out of District'"); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const orderClause = filters.orderBy ? `ORDER BY ${filters.orderBy} ${filters.orderDir || 'ASC'}` : 'ORDER BY name ASC';

    const sql = `SELECT * FROM apartments ${whereClause} ${orderClause}`;
    const result = db.exec(sql, params);
    if (!result.length) return [];

    const cols = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      cols.forEach((c, i) => obj[c] = row[i]);
      return obj;
    });
  }

  function getStats(apartments) {
    const inDistrict = apartments.filter(a => a.status !== 'Out of District');
    const totalUnits = inDistrict.reduce((s, a) => s + (a.est_units || 0), 0);
    const areas = new Set(inDistrict.map(a => a.area));
    const byStatus = {};
    inDistrict.forEach(a => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });
    const novaCount = inDistrict.filter(a => a.region === 'nova').length;
    const centralCount = inDistrict.filter(a => a.region === 'central').length;

    return {
      buildings: inDistrict.length,
      totalUnits,
      areas: areas.size,
      notContacted: byStatus['Not Contacted'] || 0,
      contacted: byStatus['Contacted'] || 0,
      scheduled: byStatus['Scheduled'] || 0,
      canvassed: byStatus['Canvassed'] || 0,
      nova: novaCount,
      central: centralCount
    };
  }

  function getAreas() {
    const res = db.exec("SELECT DISTINCT area FROM apartments WHERE status != 'Out of District' ORDER BY area");
    return res.length ? res[0].values.map(r => r[0]) : [];
  }

  function getTypes() {
    const res = db.exec("SELECT DISTINCT type FROM apartments ORDER BY type");
    return res.length ? res[0].values.map(r => r[0]) : [];
  }

  function getCounties() {
    const res = db.exec("SELECT DISTINCT county FROM apartments WHERE county != '' ORDER BY county");
    return res.length ? res[0].values.map(r => r[0]) : [];
  }

  function exportCSV() {
    const all = getAll({});
    if (!all.length) return '';
    const headers = Object.keys(all[0]);
    const lines = [headers.join(',')];
    all.forEach(row => {
      lines.push(headers.map(h => {
        const val = String(row[h] || '');
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(','));
    });
    return lines.join('\n');
  }

  return { init, loadApartments, applyLocalStatuses, saveStatus, query, getAll, getStats, getAreas, getTypes, getCounties, exportCSV };
})();
