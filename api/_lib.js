import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'node:crypto';

export const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const resend = new Resend(process.env.RESEND_API_KEY);

export const newToken = () => crypto.randomBytes(24).toString('base64url');
export const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '').trim();
export const emailOk = (e) => /^\S+@\S+\.\S+$/.test(e) && e.length < 255;
export const RELEASE_MS = 5 * 60 * 60 * 1000;

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
const accessLabel = (v) => ({ standard: 'standard', vip: 'VIP', vvip: 'VVIP' }[(v || 'standard').toLowerCase()] || 'standard');

const layout = (inner) => `<body style="margin:0;padding:0;background:#000;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000;color:#fff;font-family:'Courier New',Courier,monospace;font-size:15px;line-height:1.6;">
<tr><td style="padding:32px 24px;">
${inner}
</td></tr>
</table>
</body>`;
const para = (html, last = false) => `<p style="margin:${last ? '0' : '0 0 20px'};">${html}</p>`;

function applyMessage({ to, name, token }) {
  const link = `${process.env.SITE_URL}/#token=${token}`;
  const safeName = esc(name);
  const safeLink = esc(link);
  return {
    from: process.env.MAIL_FROM,
    to,
    subject: 'lost',
    text: `hi ${name}\n\nyou have been chosen to apply to attend.\n\n03.12.26\n\nconfirm your name here:\n${link}\n\nthis link is personal to you. please do not share.\n\nlost`,
    html: layout([
      para(`hi ${safeName}`),
      para('you have been chosen to apply to attend.'),
      para('03.12.26'),
      para(`confirm your name here:<br><a href="${safeLink}" style="color:#fff;">${safeLink}</a>`),
      para('this link is personal to you. please do not share.'),
      para('lost', true)
    ].join('\n'))
  };
}

function ackMessage({ to, name }) {
  return {
    from: process.env.MAIL_FROM,
    to,
    subject: 'lost',
    text: `hi ${name}\n\nthanks. we have received your request and will get back to you.\n\nlost`,
    html: layout([
      para(`hi ${esc(name)}`),
      para('thanks. we have received your request and will get back to you.'),
      para('lost', true)
    ].join('\n'))
  };
}

function inviteMessage({ to, name, token, access }) {
  const link = `${process.env.SITE_URL}/#token=${token}`;
  const safeName = esc(name);
  const safeLink = esc(link);
  const tier = accessLabel(access);
  return {
    from: process.env.MAIL_FROM,
    to,
    subject: 'lost opening night',
    text: `hi ${name}\n\nyou're on the list for lost preview night.\n\nyour access is ${tier}.\n\n03.12.26\n\nconfirm your details and add your guests here:\n${link}\n\nthis link is personal to you. please do not share.\n\nwe missed you.\n\nsee you soon.\n\nlost`,
    html: layout([
      para(`hi ${safeName}`),
      para('you\'re on the list for lost preview night.'),
      para(`your access is ${esc(tier)}.`),
      para('03.12.26'),
      para(`confirm your details and add your guests here:<br><a href="${safeLink}" style="color:#fff;">${safeLink}</a>`),
      para('this link is personal to you. please do not share.'),
      para('we missed you.'),
      para('see you soon.'),
      para('lost', true)
    ].join('\n'))
  };
}

const builders = { apply: applyMessage, ack: ackMessage, invite: inviteMessage };

// resend batch api takes up to 100 emails per call
export async function sendMany(items, kind = 'invite') {
  const build = builders[kind];
  for (let i = 0; i < items.length; i += 100) {
    const { error } = await resend.batch.send(items.slice(i, i + 100).map(build));
    if (error) console.error('resend error', error);
  }
}

export async function scheduleInvite(item, when) {
  const { data, error } = await resend.emails.send({ ...inviteMessage(item), scheduledAt: when });
  if (error || !data?.id) {
    console.error('resend schedule error', error);
    return null;
  }
  return data.id;
}

export async function cancelScheduled(ids) {
  if (!ids?.length || typeof resend.emails?.cancel !== 'function') return;
  for (const id of ids) {
    if (!id) continue;
    try {
      const { error } = await resend.emails.cancel(id);
      if (error) console.error('resend cancel', error);
    } catch (e) {
      console.error('resend cancel', e);
    }
  }
}
