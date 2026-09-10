const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';

async function updateTask(supabaseUrl, secretKey, taskId, expectedStatus, changes) {
  const result = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${encodeURIComponent(taskId)}&status=eq.${expectedStatus}`, {
    method: 'PATCH',
    headers: {
      apikey: secretKey,
      'content-type': 'application/json',
      prefer: 'return=representation'
    },
    body: JSON.stringify(changes)
  });
  if (!result.ok) throw new Error('The trusted worker could not update the task.');
  const rows = await result.json().catch(() => []);
  return Array.isArray(rows) && rows.length === 1;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const task = typeof request.body?.task === 'string' ? request.body.task.trim() : '';
  if (!task || task.length > 4000) return response.status(400).json({ error: 'Enter a command up to 4000 characters.' });
  const taskId = typeof request.body?.taskId === 'string' ? request.body.taskId : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
    return response.status(400).json({ error: 'A valid saved task is required.' });
  }
  const authorization = request.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'Sign in before running a command.' });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return response.status(503).json({ error: 'Gemini is not configured yet.' });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return response.status(503).json({ error: 'The trusted task worker is not configured yet.' });
  }

  const access = await fetch(`${supabaseUrl}/rest/v1/tasks?select=id,input&id=eq.${encodeURIComponent(taskId)}`, {
    method: 'GET',
    headers: { apikey: publishableKey, authorization }
  });
  const visibleTasks = await access.json().catch(() => []);
  if (!access.ok || !Array.isArray(visibleTasks) || visibleTasks.length !== 1) {
    return response.status(403).json({ error: 'You do not have access to this task.' });
  }
  const savedTask = typeof visibleTasks[0].input?.prompt === 'string' ? visibleTasks[0].input.prompt.trim() : '';
  if (!savedTask || savedTask.length > 4000) {
    return response.status(400).json({ error: 'The saved task does not contain a valid command.' });
  }

  const claimed = await updateTask(supabaseUrl, secretKey, taskId, 'pending', { status: 'running', error: null });
  if (!claimed) return response.status(409).json({ error: 'This task has already started or finished.' });

  try {
    const upstream = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: 'You are the AUTO FREE MONEY command planner. Respond concisely with the first safe, actionable plan for the user request. Do not claim an action was completed unless it actually was.' }]
        },
        contents: [{ role: 'user', parts: [{ text: savedTask }] }],
        generationConfig: { temperature: 0.2 }
      })
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = typeof payload.error?.message === 'string' ? payload.error.message : `HTTP ${upstream.status}`;
      throw new Error(`Gemini rejected the request: ${detail}`);
    }
    const result = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter((text) => typeof text === 'string')
      .join('\n')
      .trim();
    if (!result) throw new Error('Gemini returned no response.');
    const completed = await updateTask(supabaseUrl, secretKey, taskId, 'running', { status: 'succeeded', output: { result }, error: null });
    if (!completed) throw new Error('The task was no longer running.');
    return response.status(200).json({ result });
  } catch (providerError) {
    const error = providerError.message?.startsWith('Gemini ') ? providerError.message : 'The AI provider request failed.';
    try {
      await updateTask(supabaseUrl, secretKey, taskId, 'running', { status: 'failed', error });
    } catch {}
    return response.status(502).json({ error });
  }
}
