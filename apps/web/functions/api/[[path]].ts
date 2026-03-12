export async function onRequest(context: {
  request: Request;
  env: { EXPRESS_SERVER_URL: string };
  params: { path: string[] };
}) {
  const { request, env, params } = context;

  const path = params.path ? params.path.join('/') : '';
  const url = new URL(request.url);
  const targetUrl = `${env.EXPRESS_SERVER_URL}/api/${path}${url.search}`;

  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD'
      ? request.body
      : undefined,
  });

  try {
    const response = await fetch(proxyRequest);

    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', url.origin);
    newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
    return newResponse;
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy error', detail: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
      'Access-Control-Max-Age': '86400',
    },
  });
}
