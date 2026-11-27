import { db, guard, cancelScheduled } from '../_lib.js';

function branchIds(rows, root) {
  const ids = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (r.parent_id && ids.has(r.parent_id) && !ids.has(r.id)) {
        ids.add(r.id);
        grew = true;
      }
    }
  }
  return ids;
}

export default async function handler(req, res) {
  if (!guard(req, res, 'POST', true)) return;
  const id = parseInt(req.body?.id, 10);
  if (!id) return res.status(400).json({ error: 'missing id.' });
  const { data: rows, error: readError } = await db.from('invites').select('id,parent_id,release_email_id,release_at,status').limit(5000);
  if (readError) return res.status(500).json({ error: readError.message });
  const ids = branchIds(rows || [], id);
  const now = Date.now();
  const pending = (rows || [])
    .filter((r) => ids.has(r.id) && r.status !== 'revoked' && r.release_email_id && r.release_at && new Date(r.release_at).getTime() > now)
    .map((r) => r.release_email_id);
  const { error } = await db.rpc('revoke_branch', { p_id: id });
  if (error) return res.status(500).json({ error: error.message });
  await cancelScheduled(pending);
  res.json({ ok: true });
}
