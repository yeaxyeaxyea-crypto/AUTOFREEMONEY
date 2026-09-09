import { createCommand, getConnectionSummary } from './engine.js';

const connections = [
  { name: 'GitHub', detail: 'Primary source', status: 'connected' },
  { name: 'AWS Amplify', detail: 'Production hosting', status: 'connected' },
  { name: 'Shopify', detail: 'Commerce engine', status: 'setup' },
  { name: 'YouTube', detail: 'Creator publishing', status: 'planned' }
];

const list = document.querySelector('#connections');
const summary = getConnectionSummary(connections);
document.querySelector('#connection-count').textContent = `${summary.connected}/${summary.total} verified`;

for (const connection of connections) {
  const item = document.createElement('li');
  item.innerHTML = `<span><strong>${connection.name}</strong><small>${connection.detail}</small></span><em class="status ${connection.status}">${connection.status === 'setup' ? 'Setup required' : connection.status}</em>`;
  list.append(item);
}

const form = document.querySelector('#command-form');
const input = document.querySelector('#command');
const response = document.querySelector('#response');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = createCommand(input.value);
  if (!result.ok) {
    response.textContent = result.message;
    response.dataset.state = 'error';
    return;
  }

  response.textContent = `Running “${result.task}”…`;
  response.dataset.state = 'running';
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const reply = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: result.task })
    });
    const payload = await reply.json().catch(() => ({}));
    if (!reply.ok) throw new Error(payload.error || 'The AI provider could not run this command.');
    response.textContent = payload.result || 'The AI provider completed the command.';
    response.dataset.state = 'complete';
  } catch (error) {
    response.textContent = `${error.message} Your command was not sent to a provider.`;
    response.dataset.state = 'error';
  } finally {
    button.disabled = false;
  }
});
