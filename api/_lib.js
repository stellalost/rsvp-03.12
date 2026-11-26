import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'node:crypto';

export const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const resend = new Resend(process.env.RESEND_API_KEY);

export const newToken = () => crypto.randomBytes(24).toString('base64url');
export const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '').trim();
export const emailOk = (e) => /^\S+@\S+\.\S+$/.test(e) && e.length < 255;

export function isAdmin(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const a = Buffer.from(hash(String(req.headers['x-admin-secret'] || '')));
  const b = Buffer.from(hash(secret));
  return crypto.timingSafeEqual(a, b);
}

export function guard(req, res, method, admin = false) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== method) { res.status(405).json({ error: 'method not allowed.' }); return false; }
  if (admin && !isAdmin(req)) { res.status(401).json({ error: 'wrong admin password.' }); return false; }
  return true;
}

function message({ to, name, token, invitedBy }) {
  const link = `${process.env.SITE_URL}/#token=${token}`;
  const intro = invitedBy
    ? `${invitedBy} added you to the list for circus.`
    : `you're on the list for circus.`;
  return {
    from: process.env.MAIL_FROM,
    to,
    subject: 'lost',
    text: `hi ${name},\n\n${intro}\n\n18.12.26 & 19.12.26\n\nconfirm your details and add your guests here:\n${link}\n\nthis link is personal to you. please don't share it.\n\nsee you soon.\n\nlost\n\n*subject to licence*`
  };
}

// resend batch api takes up to 100 emails per call
export async function sendMany(items) {
  for (let i = 0; i < items.length; i += 100) {
    const { error } = await resend.batch.send(items.slice(i, i + 100).map(message));
    if (error) console.error('resend error', error);
  }
}
