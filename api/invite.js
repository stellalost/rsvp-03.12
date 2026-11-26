import { db, hash, bearer, guard } from './_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res, 'GET')) return;
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'this link is not valid or has been cancelled.' });
  const h = hash(token);
  const { data: me } = await db.from('invites').select('id,name,email,phone,status,level,quota').eq('token_hash', h).neq('status', 'revoked').maybeSingle();
  if (!me) return res.status(404).json({ error: 'this link is not valid or has been cancelled.' });
  const { data: children } = await db.from('invites').select('name,email,status').eq('parent_id', me.id).neq('status', 'revoked').order('id');
  const canAdd = me.level < 3 && me.status === 'confirmed';
  const remaining = canAdd ? Math.max(0, me.quota - (children?.length || 0)) : 0;
  delete me.id;
  res.json({ me, children: children || [], remaining });
}
