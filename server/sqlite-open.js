// Opens the SQLite database.
//  - Node 22.5+  -> uses Node's built-in SQLite (fast, nothing extra)
//  - older Node  -> uses sql.js (SQLite compiled to WebAssembly - works on any Node 18+)
// Both give the same tiny interface:  exec(sql)  and  prepare(sql).all/get/run(...params)
const fs = require('fs');

async function openSqlite(dbPath) {
  if (!process.env.FORCE_SQLJS) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      return { db: new DatabaseSync(dbPath), engine: 'node:sqlite' };
    } catch (e) { /* not available on this Node version - fall through */ }
  }

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();

  // sql.js keeps the database in memory, so write it to disk after changes
  let timer = null;
  const flush = () => {
    clearTimeout(timer); timer = null;
    const tmp = dbPath + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(db.export()));
    fs.renameSync(tmp, dbPath);
  };
  const scheduleSave = () => { if (!timer) timer = setTimeout(flush, 200); };
  process.on('exit', () => { if (timer) { try { flush(); } catch (e) { /* ignore */ } } });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { flush(); } catch (e) { /* ignore */ } process.exit(0); });

  const adapter = {
    exec(sql) { db.exec(sql); scheduleSave(); },
    prepare(sql) {
      const rows = (params) => {
        const st = db.prepare(sql);
        try {
          if (params.length) st.bind(params);
          const out = [];
          while (st.step()) out.push(st.getAsObject());
          return out;
        } finally { st.free(); }
      };
      return {
        all: (...params) => rows(params),
        get: (...params) => rows(params)[0],
        run: (...params) => {
          db.run(sql, params);
          const changes = db.getRowsModified();
          const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
          scheduleSave();
          return { lastInsertRowid: id, changes };
        }
      };
    }
  };
  return { db: adapter, engine: 'sql.js' };
}

module.exports = { openSqlite };
