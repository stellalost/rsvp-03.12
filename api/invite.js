import { db, hash, bearer, guard } from './_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res, 'GET')) return;
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'this link is not valid or has been cancelled.' });
  const h = hash(token);
  const { data: me } = await db.from('invites').select('id,name,email,phone,status,level,quota,child_quota,access,child_access,release_at').eq('token_hash', h).neq('status', 'revoked').maybeSingle();
  if (!me) return res.status(404).json({ error: 'this link is not valid or has been cancelled.' });
  const released = me.status === 'confirmed' || (me.status === 'applied' && me.release_at && new Date(me.release_at).getTime() <= Date.now());
  if (!released) {
    return res.json({ me: { name: me.name, email: me.email, status: me.status }, children: [], remaining: 0, released: false });
  }
  if (me.status === 'applied') {
    const { data: saved } = await db.from('invites').update({ status: 'confirmed' }).eq('id', me.id).eq('status', 'applied').select('id');
    if (saved?.length) me.status = 'confirmed';
  }
  const { data: children } = await db.from('invites').select('name,email,status,access').eq('parent_id', me.id).neq('status', 'revoked').order('id');
  const canAdd = me.level < 3 && me.status === 'confirmed';
  const remaining = canAdd ? Math.max(0, me.quota - (children?.length || 0)) : 0;
  delete me.id;
  delete me.release_at;
  res.json({ me, children: children || [], remaining, released: true });
}
