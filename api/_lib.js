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

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function message({ to, name, token }) {
  const link = `${process.env.SITE_URL}/#token=${token}`;
  const safeName = esc(name);
  const safeLink = esc(link);
  return {
    from: process.env.MAIL_FROM,
    to,
    subject: 'lost opening night',
    text: `hi ${name}\n\nyou're on the list for lost preview night.\n\n03.12.26\n\nconfirm your details and add your guests here:\n${link}\n\nthis link is personal to you. please do not share.\n\nwe missed you.\n\nsee you soon.\n\nlost`,
    html: `<body style="margin:0;padding:0;background:#000;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000;color:#fff;font-family:'Courier New',Courier,monospace;font-size:15px;line-height:1.6;">
<tr><td style="padding:32px 24px;">
<p style="margin:0 0 20px;">hi ${safeName}</p>
<p style="margin:0 0 20px;">you're on the list for lost preview night.</p>
<p style="margin:0 0 20px;">03.12.26</p>
<p style="margin:0 0 20px;">confirm your details and add your guests here:<br><a href="${safeLink}" style="color:#fff;">${safeLink}</a></p>
<p style="margin:0 0 20px;">this link is personal to you. please do not share.</p>
<p style="margin:0 0 20px;">we missed you.</p>
<p style="margin:0 0 20px;">see you soon.</p>
<p style="margin:0;">lost</p>
</td></tr>
</table>
</body>`
  };
}

// resend batch api takes up to 100 emails per call
export async function sendMany(items) {
  for (let i = 0; i < items.length; i += 100) {
    const { error } = await resend.batch.send(items.slice(i, i + 100).map(message));
    if (error) console.error('resend error', error);
  }
}
