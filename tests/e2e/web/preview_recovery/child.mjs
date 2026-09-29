// Stops a spawned child the way the launcher documents (Ctrl-C = SIGINT), escalating to SIGKILL.
// A child that already exited, normally or by a signal, has exitCode or signalCode set and will
// emit no further 'exit'; waiting for one would hang, so return at once.

export async function stopChild(child, graceMs = 10000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const gone = new Promise((ok) => child.once('exit', ok));
  child.kill('SIGINT');
  const timer = setTimeout(() => child.kill('SIGKILL'), graceMs);
  await gone;
  clearTimeout(timer);
}
