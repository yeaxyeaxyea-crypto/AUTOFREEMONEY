const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const task = typeof request.body?.task === 'string' ? request.body.task.trim() : '';
  if (!task || task.length > 4000) return response.status(400).json({ error: 'Enter a command up to 4000 characters.' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return response.status(503).json({ error: 'Gemini is not configured yet.' });

  const upstream = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: 'You are the AUTO FREE MONEY command planner. Respond concisely with the first safe, actionable plan for the user request. Do not claim an action was completed unless it actually was.' }]
      },
      contents: [{ role: 'user', parts: [{ text: task }] }],
      generationConfig: { temperature: 0.2 }
    })
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const detail = typeof payload.error?.message === 'string' ? payload.error.message : `HTTP ${upstream.status}`;
    return response.status(502).json({ error: `Gemini rejected the request: ${detail}` });
  }
  const result = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text) => typeof text === 'string')
    .join('\n')
    .trim();
  if (!result) return response.status(502).json({ error: 'Gemini returned no response.' });
  return response.status(200).json({ result });
}
