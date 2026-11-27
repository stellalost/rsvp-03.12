import { db, hash, newToken, emailOk, guard, sendMany } from '../_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res, 'POST', true)) return;
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) return res.status(400).json({ error: 'send between 1 and 500 rows.' });
  const seen = new Set();
  const clean = [];
  for (const r of rows) {
    const email = String(r.email || '').trim().toLowerCase();
    const name = String(r.name || '').trim().slice(0, 100);
    if (!name || !emailOk(email)) return res.status(400).json({ error: `bad row: ${email || name}` });
    if (seen.has(email)) continue;
    seen.add(email);
    const places = (n, fallback) => {
      const v = parseInt(n, 10);
      return Math.min(1400, Math.max(0, Number.isFinite(v) ? v : fallback));
    };
    const access = (n) => {
      const v = String(n || 'standard').trim().toLowerCase().replace(/\s+access$/, '');
      if (!['standard', 'vip', 'vvip'].includes(v)) return null;
      return v;
    };
    const tier = access(r.access);
    if (!tier) return res.status(400).json({ error: 'access must be standard, vip or vvip.' });
    clean.push({ name, email, quota: places(r.quota, 3), child_quota: places(r.child_quota, 3), access: tier, child_access: tier, token: newToken() });
  }
  const payload = clean.map(({ token, ...r }, i) => ({ ...r, token_hash: hash(clean[i].token) }));
  const { data, error } = await db.rpc('seed_invites', { p_rows: payload });
  if (error) return res.status(400).json({ error: error.message });
  const added = new Set(data.map((d) => d.email));
  await sendMany(clean.filter((c) => added.has(c.email)).map((c) => ({ to: c.email, name: c.name, token: c.token })), 'apply');
  res.json({ added: data.length, skipped: clean.length - data.length });
}
