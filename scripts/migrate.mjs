/**
 * SQL migration runner — tracks applied files in `schema_migrations`.
 *
 *   npm run migrate                 apply every pending migrations/*.sql in filename order
 *   npm run migrate:status          list applied / pending files
 *   npm run migrate:baseline        mark ALL files as applied without running them
 *   npm run migrate:baseline -- 065 mark files numbered <= 065 as applied (existing DBs)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../src/config/db.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations',
);
const MIGRATION_FILE_RE = /^(\d+)_.+\.sql$/;
// Files that open their own transaction can't be wrapped in another one.
const OWN_TRANSACTION_RE = /^\s*BEGIN\s*;/im;

const listMigrationFiles = () =>
  fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => MIGRATION_FILE_RE.test(name))
    .sort((a, b) => a.localeCompare(b));

const fileNumber = (name) => Number(name.match(MIGRATION_FILE_RE)[1]);

const ensureTable = () =>
  pool.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      baselined  BOOLEAN NOT NULL DEFAULT false
    )
  `);

const loadApplied = async () => {
  const { rows } = await pool.query(
    `SELECT filename FROM public.schema_migrations`,
  );
  return new Set(rows.map((r) => r.filename));
};

const recordApplied = (db, filename, baselined = false) =>
  db.query(
    `INSERT INTO public.schema_migrations (filename, baselined)
     VALUES ($1, $2)
     ON CONFLICT (filename) DO NOTHING`,
    [filename, baselined],
  );

const showStatus = (files, applied) => {
  for (const file of files) {
    console.log(`${applied.has(file) ? '[applied]' : '[pending]'} ${file}`);
  }
  const pending = files.filter((f) => !applied.has(f)).length;
  console.log(`\n${files.length - pending} applied, ${pending} pending`);
};

const baseline = async (files, applied, upToRaw) => {
  const upTo =
    upToRaw != null && /^\d+$/.test(String(upToRaw)) ? Number(upToRaw) : null;
  const targets = files.filter(
    (f) => !applied.has(f) && (upTo == null || fileNumber(f) <= upTo),
  );

  for (const file of targets) {
    await recordApplied(pool, file, true);
    console.log(`baselined ${file}`);
  }
  console.log(
    `\nMarked ${targets.length} file(s) as applied${upTo != null ? ` (up to ${String(upToRaw)})` : ''} without running them.`,
  );
};

const applyPending = async (files, applied) => {
  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log('No pending migrations.');
    return true;
  }

  for (const file of pending) {
    const sqlText = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const ownTransaction = OWN_TRANSACTION_RE.test(sqlText);
    const client = await pool.connect();

    console.log(`applying ${file} ...`);
    try {
      if (ownTransaction) {
        await client.query(sqlText);
        await recordApplied(client, file);
      } else {
        await client.query('BEGIN');
        await client.query(sqlText);
        await recordApplied(client, file);
        await client.query('COMMIT');
      }
      console.log(`applied  ${file}`);
    } catch (error) {
      if (!ownTransaction) {
        await client.query('ROLLBACK').catch(() => {});
      }
      console.error(`FAILED   ${file}: ${error.message}`);
      console.error('Stopped. Fix the migration (or baseline it) and run again.');
      return false;
    } finally {
      client.release();
    }
  }

  console.log(`\nApplied ${pending.length} migration(s).`);
  return true;
};

const main = async () => {
  const args = process.argv.slice(2);
  await ensureTable();

  const files = listMigrationFiles();
  const applied = await loadApplied();

  if (args.includes('--status')) {
    showStatus(files, applied);
    return true;
  }

  const baselineIndex = args.indexOf('--baseline');
  if (baselineIndex !== -1) {
    await baseline(files, applied, args[baselineIndex + 1]);
    return true;
  }

  return applyPending(files, applied);
};

main()
  .then(async (ok) => {
    await pool.end();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end().catch(() => {});
    process.exit(1);
  });
