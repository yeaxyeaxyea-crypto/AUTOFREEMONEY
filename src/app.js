import { createCommand, getConnectionSummary } from './engine.js';
import { saveCommand, loadTasks, runSavedTask } from './base.js';

const authForm = document.querySelector('#auth-form');
const authStatus = document.querySelector('#auth-status');
const authMessage = document.querySelector('#auth-message');
const signOutButton = document.querySelector('#sign-out');
let supabase;
let currentSession;
let historyRequest = 0;
const runningTasks = new Set();
const historyPanel = document.querySelector('#task-history');
const taskList = document.querySelector('#task-list');
const historyMessage = document.querySelector('#history-message');

async function refreshTasks() {
  const requestId = ++historyRequest;
  taskList.replaceChildren();
  if (!currentSession?.user) return;
  historyMessage.textContent = 'Loading saved tasks…';
  try {
    const tasks = await loadTasks(supabase);
    if (requestId !== historyRequest || !currentSession?.user) return;
    historyMessage.textContent = tasks.length ? 'Latest 20 tasks. Open a task to read its saved result.' : 'No saved tasks yet. Enter your first command above.';
    for (const task of tasks) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `${task.title} — ${task.status}`;
      const date = document.createElement('small');
      date.textContent = new Date(task.created_at).toLocaleString();
      const content = document.createElement('p');
      content.className = 'saved-result';
      content.textContent = task.output?.result || task.error || 'No result saved yet.';
      details.append(summary, date, content);
      if (task.status === 'pending') {
        const runButton = document.createElement('button');
        runButton.type = 'button';
        runButton.textContent = runningTasks.has(task.id) ? 'Running…' : 'Run task';
        runButton.disabled = runningTasks.has(task.id);
        const message = document.createElement('p');
        message.setAttribute('aria-live', 'polite');
        runButton.addEventListener('click', async () => {
          if (runningTasks.has(task.id)) return;
          runningTasks.add(task.id);
          runButton.disabled = true;
          runButton.textContent = 'Running…';
          message.textContent = 'Generating and saving the plan…';
          try {
            const result = await runSavedTask(supabase, task);
            content.textContent = result || 'Result saved. Refresh to view it.';
            summary.textContent = `${task.title} — succeeded`;
            runButton.hidden = true;
            message.textContent = 'Plan saved.';
          } catch (error) {
            message.textContent = `${error.message} Use Refresh to check the latest task status.`;
            runButton.textContent = 'Check status with Refresh';
          } finally {
            runningTasks.delete(task.id);
          }
        });
        details.append(runButton, message);
      }
      taskList.append(details);
    }
  } catch (error) {
    if (requestId === historyRequest) historyMessage.textContent = `Could not load history: ${error.message}`;
  }
}
document.querySelector('#refresh-tasks').addEventListener('click', refreshTasks);

function showSession(session, profile) {
  currentSession = session;
  const signedIn = Boolean(session?.user);
  historyPanel.hidden = !signedIn;
  ++historyRequest;
  taskList.replaceChildren();
  historyMessage.textContent = '';
  if (signedIn) void refreshTasks();
  authForm.hidden = signedIn;
  signOutButton.hidden = !signedIn;
  authStatus.textContent = signedIn ? `Base verified: ${profile?.display_name || session.user.email}` : 'Base ready — sign in';
  authMessage.textContent = signedIn ? 'Authenticated profile read passed. Supabase RLS is active.' : '';
  authMessage.dataset.state = signedIn ? 'complete' : '';
}

async function loadProfile(session) {
  if (!session?.user) return showSession(null);
  const { data, error } = await supabase.from('profiles').select('display_name').eq('id', session.user.id).single();
  if (error) throw error;
  showSession(session, data);
}

async function connectBase() {
  try {
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    if (!configResponse.ok) throw new Error(config.error || 'Base configuration unavailable.');
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);
    const { data: { session } } = await supabase.auth.getSession();
    await loadProfile(session);
  } catch (error) {
    authStatus.textContent = 'Base setup required';
    authMessage.textContent = error.message;
    authMessage.dataset.state = 'error';
  }
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authMessage.textContent = 'Checking secure access…';
  authMessage.dataset.state = 'pending';
  const email = document.querySelector('#auth-email').value.trim();
  const password = document.querySelector('#auth-password').value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  document.querySelector('#auth-password').value = '';
  if (error) {
    authMessage.textContent = error.message;
    authMessage.dataset.state = 'error';
    return;
  }
  try {
    await loadProfile(data.session);
  } catch (profileError) {
    authMessage.textContent = `Signed in, but profile verification failed: ${profileError.message}`;
    authMessage.dataset.state = 'error';
  }
});

signOutButton.addEventListener('click', async () => {
  await supabase.auth.signOut();
  showSession(null);
});

connectBase();

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
    const taskId = await saveCommand(supabase, currentSession?.user, result.task);
    const reply = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify({ task: result.task, taskId })
    });
    const payload = await reply.json().catch(() => ({}));
    if (!reply.ok) throw new Error(payload.error || 'The AI provider could not run this command.');
    response.textContent = `${payload.result || 'The AI provider completed the command.'} Task saved to your base.`;
    response.dataset.state = 'complete';
  } catch (error) {
    response.textContent = `${error.message} Your command was not sent to a provider.`;
    response.dataset.state = 'error';
  } finally {
    button.disabled = false;
    void refreshTasks();
  }
});
