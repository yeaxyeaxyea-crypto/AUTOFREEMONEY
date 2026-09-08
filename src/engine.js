export function createCommand(input) {
  const task = String(input ?? '').trim();
  if (!task) {
    return { ok: false, message: 'Tell FREE AI what you want to build.' };
  }
  return { ok: true, task, status: 'Connection required' };
}

export function getConnectionSummary(connections) {
  return {
    connected: connections.filter(({ status }) => status === 'connected').length,
    total: connections.length
  };
}
