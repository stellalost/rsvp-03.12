import { db, hash, bearer, guard } from './_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res, 'POST')) return;
  const token = bearer(req);
  const name = String(req.body?.name || '').trim().slice(0, 100);
  const phone = String(req.body?.phone || '').trim().slice(0, 30);
  if (!token || !name || phone.replace(/\D/g, '').length < 7) return res.status(400).json({ error: 'enter your name and a valid phone number.' });
  const { data, error } = await db.from('invites').update({ name, phone, status: 'confirmed' }).eq('token_hash', hash(token)).neq('status', 'revoked').select('id');
  if (error || !data?.length) return res.status(404).json({ error: 'this link is not valid or has been cancelled.' });
  res.json({ ok: true });
}
