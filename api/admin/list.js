import { db, guard } from '../_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res, 'GET', true)) return;
  const { data, error } = await db.from('invites').select('id,parent_id,name,email,phone,status,level,quota').order('id').limit(5000);
  if (error) return res.status(500).json({ error: error.message });
  const rows = data.map((r) => ({ ...r, parent: r.parent_id }));
  res.json({ rows, count: rows.filter((r) => r.status !== 'revoked').length });
}
