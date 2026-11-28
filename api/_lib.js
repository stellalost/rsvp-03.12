import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'node:crypto';

export const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const resend = new Resend(process.env.RESEND_API_KEY);

export const newToken = () => crypto.randomBytes(24).toString('base64url');
export const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '').trim();
export const emailOk = (e) => /^\S+@\S+\.\S+$/.test(e) && e.length < 255;
export const RELEASE_MS = 60 * 1000;

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
const layout = (inner) => `<html><head>
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<meta name="format-detection" content="address=no,telephone=no">
<style>
  body, table, td { background-color:#000000 !important; color:#ffffff !important; }
  p, a, font { color:#ffffff !important; }
</style>
</head><body bgcolor="#000000" style="margin:0;padding:0;background-color:#000000;color:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#000000" style="background-color:#000000;color:#ffffff;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:1.2;">
<tr><td align="center" bgcolor="#000000" style="background-color:#000000;color:#ffffff;padding:96px 28px 120px;text-align:center;">
<table role="presentation" align="center" width="280" cellpadding="0" cellspacing="0" bgcolor="#000000" style="background-color:#000000;width:280px;max-width:280px;margin:0 auto;">
<tr><td align="center" bgcolor="#000000" style="background-color:#000000;text-align:center;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:1.2;color:#ffffff;">
${inner}
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
const para = (html, last = false, top) => {
  const marginTop = top ?? (last ? 40 : 0);
  return `<p align="center" style="margin:${marginTop}px 0 ${last ? 0 : 22}px;text-align:center;line-height:1.2;background-color:#000000;color:#ffffff;"><font color="#ffffff">${html}</font></p>`;
};
const button = (link, label) => {
  const safe = esc(link);
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" bgcolor="#000000" style="background-color:#000000;margin:36px auto 22px;"><tr><td align="center" bgcolor="#000000" style="background-color:#000000;border:1px solid #ffffff;"><a href="${safe}" style="display:inline-block;padding:10px 22px;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:1.2;color:#ffffff;text-decoration:none;background-color:#000000;border:1px solid #ffffff;"><font color="#ffffff">${esc(label)}</font></a></td></tr></table>`;
};

function applyMessage({ to, name, token }) {
  const link = `${process.env.SITE_URL}/#token=${token}`;
  const shown = String(name || '').toLowerCase();
  const safeName = esc(shown);
  return {
    from: process.env.MAIL_FROM,
    to,
    subject: 'lost preview night',
    text: `hi ${shown}\n\nyou are invited to the lost preview night on 03.12\n\nplease fill in the form by 02.12 at 12pm\n\nenter\n${link}\n\nyou will be the first\n\nlost`,
    html: layout([
      para(`hi ${safeName}`),
      para('you are invited to the lost preview night on 03.12'),
      para('please fill in the form by 02.12 at 12pm'),
      button(link, 'enter'),
      para('you will be the first'),
      para('lost', true)
    ].join('\n'))
  };
}

function ackMessage({ to, name }) {
  const shown = String(name || '').toLowerCase();
  return {
    from: process.env.MAIL_FROM,
    to,
    subject: 'lost preview night reply',
    text: `hi ${shown}\n\nwe have received your reply for lost preview night\n\nyou will be notified shortly with next steps\n\n03.12\n\nlost`,
    html: layout([
      para(`hi ${esc(shown)}`),
      para('we have received your reply for lost preview night'),
      para('you will be notified shortly with next steps'),
      para('03.12'),
      para('lost', true)
    ].join('\n'))
  };
}

function inviteMessage({ to, name, token, access, quota, level }) {
  const link = `${process.env.SITE_URL}/#token=${token}`;
  const shown = String(name || '').toLowerCase();
  const safeName = esc(shown);
  const tier = (access || 'standard').toLowerCase();
  const letter = { vvip: 'a', vip: 'b', standard: 'c' }[tier] || 'c';
  const canInvite = Number(level) < 3 && Number(quota) > 0;
  const confirmed = tier === 'standard'
    ? 'your place at lost preview night has been confirmed'
    : 'your place at lost preview night 03.12 has been confirmed';
  const queue = `please join queue ${letter}`;
  const note = 'this evening is designed to help test our systems. prompt arrival is important. you will be the first to enter lost 02. your participation for this evening helps to prepare for opening night.';
  const lines = [
    `hi ${shown}`,
    '',
    confirmed,
    '',
    '9pm - 3am',
    '',
    'last entry 12am',
    '',
    'we will reveal the address on 03.12 at 12pm',
    '',
    queue,
    ''
  ];
  if (canInvite) lines.push('add your guests', link, '');
  lines.push('missed you.', '', 'see you soon.', '', 'lost', '', 'note on our preview night:', '', note);
  const html = [
    para(`hi ${safeName}`),
    para(confirmed),
    para('9pm - 3am'),
    para('last entry 12am'),
    para('we will reveal the address on 03.12 at 12pm'),
    para(queue)
  ];
  if (canInvite) html.push(button(link, 'add your guests'));
  html.push(
    para('missed you.'),
    para('see you soon.'),
    para('lost'),
    para('note on our preview night:', false, 36),
    para(note, true)
  );
  return {
    from: process.env.MAIL_FROM,
    to,
    subject: 'lost opening night',
    text: lines.join('\n'),
    html: layout(html.join('\n'))
  };
}

const builders = { apply: applyMessage, ack: ackMessage, invite: inviteMessage };

// resend batch api takes up to 100 emails per call
export async function sendMany(items, kind = 'invite') {
  const build = builders[kind];
  for (let i = 0; i < items.length; i += 100) {
    const { error } = await resend.batch.send(items.slice(i, i + 100).map(build));
    if (error) {
      console.error('resend error', error);
      return error;
    }
  }
  return null;
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
