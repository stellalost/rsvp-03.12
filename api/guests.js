import { db, hash, newToken, bearer, emailOk, guard, sendMany } from './_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res, 'POST')) return;
  const token = bearer(req);
  const guests = req.body?.guests;
  if (!token || !Array.isArray(guests) || guests.length < 1 || guests.length > 3000) return res.status(400).json({ error: 'that is more guests than you have left.' });
  const clean = guests.map((g) => ({ name: String(g.name || '').trim().slice(0, 100), email: String(g.email || '').trim().toLowerCase() }));
  if (clean.some((g) => !g.name || !emailOk(g.email))) return res.status(400).json({ error: 'each guest needs a name and a valid email.' });
  if (new Set(clean.map((g) => g.email)).size !== clean.length) return res.status(400).json({ error: 'you entered the same email twice.' });

  const raw = clean.map(() => newToken());
  const payload = clean.map((g, i) => ({ ...g, token_hash: hash(raw[i]) }));
  const { error } = await db.rpc('add_guests', { p_token_hash: hash(token), p_guests: payload });
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'already on the list' });
    return res.status(400).json({ error: error.message });
  }
  await sendMany(clean.map((g, i) => ({ to: g.email, name: g.name, token: raw[i] })), 'apply');
  res.json({ ok: true });
}
