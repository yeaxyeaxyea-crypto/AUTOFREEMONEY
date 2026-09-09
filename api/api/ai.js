const gatewayUrl = process.env.AI_GATEWAY_URL || 'https://ai-gateway.vercel.sh/v1/chat/completions';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const task = typeof request.body?.task === 'string' ? request.body.task.trim() : '';
  if (!task || task.length > 4000) return response.status(400).json({ error: 'Enter a command up to 4000 characters.' });
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return response.status(503).json({ error: 'AI provider is not configured yet.' });

  const upstream = await fetch(gatewayUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      // The -free model prevents an unexpected charge when no credits are configured.
      // Set AI_GATEWAY_MODEL in Vercel later to choose a paid or BYOK model.
      model: process.env.AI_GATEWAY_MODEL || 'inclusionai/ling-3.0-flash-sante-free',
      messages: [
        { role: 'system', content: 'You are the AUTO FREE MONEY command planner. Respond concisely with the first safe, actionable plan for the user request. Do not claim an action was completed unless it actually was.' },
        { role: 'user', content: task }
      ],
      temperature: 0.2
    })
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const detail = typeof payload.error?.message === 'string' ? payload.error.message : '';
    return response.status(502).json({ error: detail ? `The AI gateway rejected the request: ${detail}` : 'The AI gateway rejected the request.' });
  }
  const result = payload.choices?.[0]?.message?.content;
  if (typeof result !== 'string' || !result.trim()) return response.status(502).json({ error: 'The AI gateway returned no response.' });
  return response.status(200).json({ result: result.trim() });
}
