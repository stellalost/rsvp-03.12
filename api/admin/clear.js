import { db, guard } from '../_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res, 'POST', true)) return;
  const { error } = await db.from('invites').delete().gte('id', 0);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}
