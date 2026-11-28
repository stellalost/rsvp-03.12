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
    if (seen.has(email)) return res.status(400).json({ error: `${email} is a duplicate.` });
    seen.add(email);
    const places = (n, fallback) => {
      const v = parseInt(n, 10);
      return Math.min(3000, Math.max(0, Number.isFinite(v) ? v : fallback));
    };
    const access = (n) => {
      const v = String(n || 'c').trim().toLowerCase().replace(/\s+access$/, '');
      return { a: 'vvip', vvip: 'vvip', b: 'vip', vip: 'vip', c: 'standard', standard: 'standard' }[v] || null;
    };
    const tier = access(r.access);
    if (!tier) return res.status(400).json({ error: 'access must be A, B or C.' });
    clean.push({ name, email, quota: places(r.quota, 3), child_quota: places(r.child_quota, 3), access: tier, child_access: tier, token: newToken() });
  }
  const { data: already, error: lookupError } = await db.from('invites').select('email').in('email', clean.map((c) => c.email)).neq('status', 'revoked');
  if (lookupError) return res.status(500).json({ error: lookupError.message });
  if (already?.length) return res.status(400).json({ error: `${already.map((r) => r.email).join(', ')} already on the list.` });
  const payload = clean.map(({ token, ...r }, i) => ({ ...r, token_hash: hash(clean[i].token) }));
  const { data, error } = await db.rpc('seed_invites', { p_rows: payload });
  if (error) return res.status(400).json({ error: error.message });
  const addedRows = data || [];
  const added = new Set(addedRows.map((d) => d.email));
  const mailError = await sendMany(clean.filter((c) => added.has(c.email)).map((c) => ({ to: c.email, name: c.name, token: c.token })), 'apply');
  if (mailError) {
    if (addedRows.length) await db.from('invites').delete().in('id', addedRows.map((d) => d.id));
    return res.status(502).json({ error: 'the emails did not send. these people were not added. paste them again.' });
  }
  res.json({ added: addedRows.length, skipped: clean.length - addedRows.length });
}
