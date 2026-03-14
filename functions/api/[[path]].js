export async function onRequest(context) {
  const { request, env, params } = context;

  // Handle CORS preflight
  const requestOrigin = request.headers.get('origin') || '';
  const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const originAllowed = allowedOrigins.includes(requestOrigin);

  if (request.method === 'OPTIONS') {
    const corsHeaders = originAllowed
      ? {
          'Access-Control-Allow-Origin': requestOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        }
      : {};
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const expressUrl = env.EXPRESS_SERVER_URL;
  if (!expressUrl) {
    return new Response(JSON.stringify({ error: 'EXPRESS_SERVER_URL not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const path = params.path ? params.path.join('/') : '';
  const url = new URL(request.url);
  const targetUrl = `${expressUrl}/api/${path}${url.search}`;

  console.log('Proxying to:', targetUrl);

  const headers = new Headers(request.headers);
  headers.delete('host');

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? request.body
        : undefined,
    });

    console.log('Railway response status:', response.status);

    const newHeaders = new Headers(response.headers);
    if (originAllowed) {
      newHeaders.set('Access-Control-Allow-Origin', requestOrigin);
      newHeaders.set('Access-Control-Allow-Credentials', 'true');
      newHeaders.set('Vary', 'Origin');
    }

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (err) {
    console.error('Fetch error:', err.message, err.cause);
    return new Response(JSON.stringify({ error: 'Proxy error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
