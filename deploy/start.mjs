const origin = process.env.SCHEDU_ORIGIN;
try {
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error();
} catch {
  console.error('Set SCHEDU_ORIGIN to the browser-facing HTTP(S) origin, with no path.');
  process.exit(1);
}
if (!process.env.SCHEDU_SETUP_TOKEN || process.env.SCHEDU_SETUP_TOKEN.length < 32) {
  console.error('Set SCHEDU_SETUP_TOKEN to a random secret of at least 32 characters.');
  process.exit(1);
}
process.umask(0o077);
await import('../server.js');
