export default function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader?.('allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    return response.status(503).json({ error: 'Supabase connection is not configured.' });
  }

  return response.status(200).json({ supabaseUrl, supabasePublishableKey });
}
