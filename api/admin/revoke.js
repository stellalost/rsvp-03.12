import { db, guard } from '../_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res, 'POST', true)) return;
  const id = parseInt(req.body?.id);
  if (!id) return res.status(400).json({ error: 'missing id.' });
  const { error } = await db.rpc('revoke_branch', { p_id: id });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}
