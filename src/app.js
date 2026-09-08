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

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const result = createCommand(input.value);
  response.textContent = result.ok
    ? `Queued locally: “${result.task}”. Connect an AI provider to run it.`
    : result.message;
  response.dataset.state = result.ok ? 'pending' : 'error';
});
