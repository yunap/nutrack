const fs   = require('fs');
const path = require('path');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let _level = LEVELS.info;
let _stream = null;
let _logDir = null;
let _currentFile = null;

function init(opts = {}) {
  const level = opts.level || 'info';
  _level = LEVELS[level] ?? LEVELS.info;
  _logDir = opts.dir || path.join(__dirname, 'data', 'logs');

  if (!fs.existsSync(_logDir)) fs.mkdirSync(_logDir, { recursive: true });

  _openDayFile();
  // rotate at midnight
  setInterval(() => _openDayFile(), 60000);

  _write('info', `Logger started — level=${level}, dir=${_logDir}`);
}

function _dayStamp() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function _openDayFile() {
  const file = path.join(_logDir, `${_dayStamp()}.log`);
  if (file === _currentFile) return; // same day
  if (_stream) _stream.end();
  _stream = fs.createWriteStream(file, { flags: 'a' });
  _currentFile = file;
}

function _ts() {
  return new Date().toISOString();
}

function _fmt(level, msg, meta) {
  const base = `${_ts()} [${level.toUpperCase().padEnd(5)}] ${msg}`;
  if (meta !== undefined && meta !== null) {
    const s = typeof meta === 'string' ? meta :
              meta instanceof Error ? meta.stack || meta.message :
              JSON.stringify(meta);
    return `${base}  ${s}`;
  }
  return base;
}

function _write(level, msg, meta) {
  if (LEVELS[level] < _level) return;
  const line = _fmt(level, msg, meta);
  if (_stream) _stream.write(line + '\n');
  // also write to stdout for warn/error, and for debug in dev mode
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (_level === LEVELS.debug) console.log(line);
}

// Express middleware — logs method, url, status, duration
function middleware(req, res, next) {
  const start = Date.now();
  const origEnd = res.end;
  res.end = function (...args) {
    const ms = Date.now() - start;
    const profileId = req.headers['x-profile-id'] || '-';
    _write('info', `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms pid=${profileId}`);
    origEnd.apply(res, args);
  };
  next();
}

module.exports = {
  init,
  middleware,
  debug: (msg, meta) => _write('debug', msg, meta),
  info:  (msg, meta) => _write('info',  msg, meta),
  warn:  (msg, meta) => _write('warn',  msg, meta),
  error: (msg, meta) => _write('error', msg, meta),
};
