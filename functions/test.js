export async function onRequest(context) {
  const expressUrl = context.env.EXPRESS_SERVER_URL;
  try {
    const res = await fetch(`${expressUrl}/health`);
    const body = await res.text();
    return new Response(JSON.stringify({
      expressUrl,
      status: res.status,
      body
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      expressUrl,
      error: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
