const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const root = path.resolve(__dirname, '..');
const runtime = path.join(process.env.LOCALAPPDATA, 'ShiyoushuWeb');
const pgBin = path.join(runtime, 'tools', 'pgsql', 'bin');
const pgData = path.join(runtime, 'data');
const configFile = path.join(runtime, 'web.env');
const logDirectory = path.join(runtime, 'logs');
const host = '127.0.0.1';
const databasePort = 55434;
const webPort = 8797;
const database = 'shiyoushu_web';
const appRole = 'shiyoushu_app';
const postgresEnv = {
  ...process.env,
  __COMPAT_LAYER: `${process.env.__COMPAT_LAYER ?? ''} RunAsInvoker`.trim(),
};

function makeConfig(domain) {
  if (fs.existsSync(configFile)) return;
  if (!domain || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
    throw new Error('Pass the deployed hostname to prepare on first use.');
  }
  const adminPassword = randomBytes(32).toString('hex');
  const appPassword = randomBytes(32).toString('hex');
  const authSecret = randomBytes(32).toString('hex');
  fs.writeFileSync(configFile, [
    `APP_BASE_URL=https://${domain.toLowerCase()}`,
    `DATABASE_URL=postgresql://${appRole}:${appPassword}@${host}:${databasePort}/${database}`,
    `AUTH_SECRET=${authSecret}`,
    `POSTGRES_ADMIN_PASSWORD=${adminPassword}`,
    'MAIL_TRANSPORT=disabled',
    'AI_MODE=disabled',
    '',
  ].join('\n'), { flag: 'wx' });
}

function readConfig() {
  const { POSTGRES_ADMIN_PASSWORD: adminPassword, ...settings } = parseEnv(fs.readFileSync(configFile, 'utf8'));
  const url = new URL(settings.DATABASE_URL);
  if (url.protocol !== 'postgresql:' || url.hostname !== host || url.port !== String(databasePort) ||
      url.pathname !== `/${database}` || url.username !== appRole || !/^[a-f0-9]{64}$/.test(url.password) ||
      !/^[a-f0-9]{64}$/.test(adminPassword)) {
    throw new Error('Expected the dedicated local web database and its original credentials.');
  }
  return {
    adminPassword,
    appPassword: url.password,
    env: { ...process.env, ...settings, NODE_ENV: 'production', SHIYOUSHU_DEMO: '0',
      TEST_DATABASE_URL: '', NEXT_TELEMETRY_DISABLED: '1' },
  };
}

function run(file, args, env, output, allowedExitCodes = [0]) {
  const result = spawnSync(file, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', output, output] });
  if (result.error) throw result.error;
  if (!allowedExitCodes.includes(result.status)) throw new Error(`${path.basename(file)} exited with code ${result.status}.`);
  return result.status;
}

function initializeCluster(adminPassword) {
  if (fs.existsSync(path.join(pgData, 'PG_VERSION'))) return;
  const passwordFile = path.join(runtime, 'initdb-password');
  fs.writeFileSync(passwordFile, `${adminPassword}\n`);
  try {
    run(path.join(pgBin, 'initdb.exe'), [
      '-D', pgData, '-U', 'postgres', '-A', 'scram-sha-256', '--encoding=UTF8', '--locale=C',
      `--pwfile=${passwordFile}`,
    ], postgresEnv, 'inherit');
  } finally {
    fs.rmSync(passwordFile, { force: true });
  }
}

function startDatabase(output) {
  if (fs.readFileSync(path.join(pgData, 'PG_VERSION'), 'utf8').trim() !== '18') {
    throw new Error('The web database requires a PostgreSQL 18 cluster.');
  }
  const pgCtl = path.join(pgBin, 'pg_ctl.exe');
  const status = run(pgCtl, ['-D', pgData, 'status'], postgresEnv, output, [0, 3]);
  if (status === 3) {
    run(pgCtl, ['-D', pgData, '-l', path.join(logDirectory, 'postgres.log'),
      '-o', `-h${host} -p${databasePort}`, '-w', '-t', '30', 'start'], postgresEnv, output);
  }
}

async function ensureDatabase({ adminPassword, appPassword }) {
  const { Client } = require('pg');
  const admin = new Client({ host, port: databasePort, database: 'postgres', user: 'postgres',
    password: adminPassword, connectionTimeoutMillis: 5000 });
  await admin.connect();
  try {
    const { rows: [cluster] } = await admin.query('SHOW data_directory');
    if (path.resolve(cluster.data_directory).toLowerCase() !== path.resolve(pgData).toLowerCase()) {
      throw new Error('Unexpected PostgreSQL instance.');
    }
    const role = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appRole]);
    if (!role.rowCount) {
      const { rows: [creation] } = await admin.query(
        'SELECT format(\'CREATE ROLE %I LOGIN PASSWORD %L\', $1::text, $2::text) AS sql', [appRole, appPassword],
      );
      await admin.query(creation.sql);
    }
    const existing = await admin.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1', [database]);
    if (!existing.rowCount) await admin.query(`CREATE DATABASE ${database} OWNER ${appRole}`);
    else if (existing.rows[0].owner !== appRole) throw new Error('Unexpected web database owner.');
  } finally {
    await admin.end();
  }
}

function migrate(env, output) {
  run(process.execPath, ['--import', 'tsx', 'deploy/migrate.ts', '--windows'], env, output);
}

async function serve(env, output, watchTask) {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start',
    '--hostname', host, '--port', String(webPort)], {
    cwd: root, env, windowsHide: true, stdio: ['ignore', output, output],
  });

  // Ending the scheduled task stops its WScript launcher. Close the web child when that launcher exits.
  const launcherPid = process.ppid;
  const timer = watchTask ? setInterval(() => {
    try {
      process.kill(launcherPid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') child.kill();
    }
  }, 500) : undefined;

  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => resolve(code ?? 1));
    });
  } finally {
    clearInterval(timer);
  }
}

async function main() {
  const action = process.argv[2];
  if (action !== 'prepare' && action !== 'serve') throw new Error('Use windows.cjs prepare [hostname] or serve.');
  fs.mkdirSync(logDirectory, { recursive: true });
  if (action === 'prepare') {
    makeConfig(process.argv[3]);
    const config = readConfig();
    initializeCluster(config.adminPassword);
    startDatabase('inherit');
    await ensureDatabase(config);
    migrate(config.env, 'inherit');
    return;
  }

  const output = fs.openSync(path.join(logDirectory, 'web.log'), 'a');
  try {
    const { env } = readConfig();
    startDatabase(output);
    migrate(env, output);
    await serve(env, output, process.argv[3] === '--watch-task');
  } catch (error) {
    fs.writeSync(output, `Start failed: ${error.code ?? error.message}\n`);
    process.exitCode = 1;
  } finally {
    fs.closeSync(output);
  }
}

main().catch(error => {
  console.error(`Deployment failed: ${error.code ?? error.message}`);
  process.exitCode = 1;
});
