// Vercel serverless function: /api/jev  (set TYPESAFE_API_KEY in the Vercel project's environment variables)
import { handleJev } from '../server/jevHandler.mjs';

export default async function handler(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const { status, json } = await handleJev({ method: req.method, body: req.body, ip, env: process.env });
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(json);
}
