import { db, hash, bearer, guard } from './_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res, 'POST')) return;
  const token = bearer(req);
  const name = String(req.body?.name || '').trim().slice(0, 100);
  const phone = String(req.body?.phone || '').trim().slice(0, 30);
  if (!token || !name || phone.replace(/\D/g, '').length < 7) return res.status(400).json({ error: 'enter your name and a valid phone number.' });

  const { data: me } = await db.from('invites').select('id,status,release_at').eq('token_hash', hash(token)).neq('status', 'revoked').maybeSingle();
  if (!me) return res.status(404).json({ error: 'this link is not valid or has been cancelled.' });
  const open = me.status === 'confirmed' || (me.status === 'applied' && me.release_at && new Date(me.release_at).getTime() <= Date.now());
  if (!open) {
    return res.status(400).json({ error: me.status === 'applied' ? 'we have received your request and will get back to you.' : 'confirm your name first.' });
  }

  const { data, error } = await db.from('invites').update({ name, phone, status: 'confirmed' }).eq('id', me.id).neq('status', 'revoked').select('id');
  if (error || !data?.length) return res.status(404).json({ error: 'this link is not valid or has been cancelled.' });
  res.json({ ok: true });
}
