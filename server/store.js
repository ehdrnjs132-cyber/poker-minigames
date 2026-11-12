// Tiny key-value store. Everything lives in memory for fast reads; writes are
// persisted to Postgres when DATABASE_URL is set, otherwise to a JSON file.
// (On Render's free web service the file is wiped on every restart/redeploy,
// so set DATABASE_URL for records that survive.)
const fs = require('fs');
const path = require('path');

const FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'store.json');

class Store {
  constructor() {
    this.data = new Map();
    this.backend = process.env.DATABASE_URL ? 'postgres' : 'file';
    this.pool = null;
    this.writeTimer = null;
  }

  async init() {
    if (this.backend === 'postgres') {
      const { Pool } = require('pg');
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
      await this.pool.query('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v JSONB NOT NULL)');
      const { rows } = await this.pool.query('SELECT k, v FROM kv');
      for (const r of rows) this.data.set(r.k, r.v);
    } else {
      try {
        const obj = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        for (const [k, v] of Object.entries(obj)) this.data.set(k, v);
      } catch {
        /* first run */
      }
    }
    console.log(`Store: ${this.backend}, ${this.data.size} records`);
  }

  get(k) {
    return this.data.get(k);
  }

  set(k, v) {
    this.data.set(k, v);
    if (this.pool) {
      this.pool.query('INSERT INTO kv (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v', [k, JSON.stringify(v)])
        .catch((e) => console.error('store write failed', k, e.message));
    } else {
      this.scheduleFileWrite();
    }
  }

  *entries(prefix) {
    for (const [k, v] of this.data) if (k.startsWith(prefix)) yield [k, v];
  }

  scheduleFileWrite() {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        const tmp = `${FILE}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.data)));
        fs.renameSync(tmp, FILE);
      } catch (e) {
        console.error('store file write failed', e.message);
      }
    }, 500);
  }
}

module.exports = new Store();
