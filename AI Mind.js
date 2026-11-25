// Vercel serverless proxy for Fujitec Mind.
// Verifies the user's Firebase ID token, then forwards to Anthropic with the server-side key.
const FIREBASE_API_KEY = 'AIzaSyAzBOuMJNgBX5ommIFfRSA5ohjTl0BWmKs'; // public web key from FX_FIREBASE
const ALLOWED_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'];

export const config = { maxDuration: 300 };

async function verify(token) {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }) }
  );
  if (!r.ok) return false;
  const j = await r.json();
  return !!(j.users && j.users.length);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'POST only' } });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !(await verify(token))) return res.status(401).json({ error: { message: 'Sign in first.' } });
  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY is not set on the server.' } });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  if (!ALLOWED_MODELS.includes(body.model)) body.model = 'claude-sonnet-5-5';
  body.max_tokens = Math.min(+body.max_tokens || 4096, 8192);
  delete body.stream;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    res.status(r.status).setHeader('content-type', 'application/json').send(await r.text());
  } catch (e) {
    res.status(503).json({ error: { message: 'Upstream unreachable.' } });
  }
}
