import { db, hash, bearer, guard, sendMany, scheduleInvite, RELEASE_MS } from './_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res, 'POST')) return;
  const token = bearer(req);
  const name = String(req.body?.name || '').trim().slice(0, 100);
  if (!token || !name) return res.status(400).json({ error: 'enter your name.' });

  const { data: existing } = await db.from('invites').select('id,status').eq('token_hash', hash(token)).neq('status', 'revoked').maybeSingle();
  if (!existing) return res.status(404).json({ error: 'this link is not valid or has been cancelled.' });
  if (existing.status !== 'invited') return res.json({ ok: true });

  const releaseAt = new Date(Date.now() + RELEASE_MS).toISOString();
  const { data, error } = await db.from('invites')
    .update({ name, status: 'applied', applied_at: new Date().toISOString(), release_at: releaseAt })
    .eq('id', existing.id)
    .eq('status', 'invited')
    .select('id,email,access')
    .maybeSingle();
  if (error || !data) return res.status(409).json({ error: 'we have already received your request.' });

  await sendMany([{ to: data.email, name }], 'ack');
  const emailId = await scheduleInvite({ to: data.email, name, token, access: data.access }, releaseAt);
  if (!emailId) {
    await db.from('invites').update({ status: 'invited', applied_at: null, release_at: null }).eq('id', data.id).eq('status', 'applied');
    return res.status(502).json({ error: 'something went wrong. try again.' });
  }
  await db.from('invites').update({ release_email_id: emailId }).eq('id', data.id);
  res.json({ ok: true });
}
