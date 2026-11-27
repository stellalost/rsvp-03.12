import { db, guard, cancelScheduled } from '../_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res, 'POST', true)) return;
  const { data } = await db.from('invites').select('release_email_id,release_at').not('release_email_id', 'is', null).limit(5000);
  const now = Date.now();
  const pending = (data || []).filter((r) => r.release_at && new Date(r.release_at).getTime() > now).map((r) => r.release_email_id);
  await cancelScheduled(pending);
  const { error } = await db.from('invites').delete().gte('id', 0);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}
