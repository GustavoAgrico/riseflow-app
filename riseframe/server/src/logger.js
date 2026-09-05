const COLORS = {
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  ok: '\x1b[32m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

function line(level, scope, msg, extra) {
  const color = COLORS[level] || '';
  const head = `${COLORS.dim}${stamp()}${COLORS.reset} ${color}${level.toUpperCase().padEnd(5)}${COLORS.reset}`;
  const tag = scope ? `${COLORS.dim}[${scope}]${COLORS.reset} ` : '';
  const out = `${head} ${tag}${msg}`;
  if (extra !== undefined) console.log(out, extra);
  else console.log(out);
}

export function makeLogger(scope) {
  return {
    info: (m, e) => line('info', scope, m, e),
    warn: (m, e) => line('warn', scope, m, e),
    error: (m, e) => line('error', scope, m, e),
    ok: (m, e) => line('ok', scope, m, e),
  };
}

export const log = makeLogger('riseframe');
