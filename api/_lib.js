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
const queueLine = (v) => ({ standard: 'please join the general admission queue', vip: 'please join the VIP queue', vvip: 'please join the VVIP queue' }[(v || 'standard').toLowerCase()] || 'please join the general admission queue');

const layout = (inner) => `<html><head><meta name="format-detection" content="address=no,telephone=no"></head><body style="margin:0;padding:0;background:#000;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#000000" style="background:#000;color:#fff;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:1.2;">
<tr><td align="center" bgcolor="#000000" style="padding:96px 28px 120px;text-align:center;">
<table role="presentation" align="center" width="280" cellpadding="0" cellspacing="0" style="width:280px;max-width:280px;margin:0 auto;">
<tr><td align="center" style="text-align:center;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:1.2;color:#fff;">
${inner}
<div style="display:none;max-height:0;overflow:hidden;">${Date.now()}-${Math.random().toString(36).slice(2)}</div>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
const para = (html, last = false, top) => {
  const marginTop = top ?? (last ? 40 : 0);
  return `<p align="center" style="margin:${marginTop}px 0 ${last ? 0 : 22}px;text-align:center;line-height:1.2;">${html}</p>`;
};
const linkText = (link, label) => {
  const safe = esc(link);
  return `<a href="${safe}" style="color:#ffffff;text-decoration:underline;"><font color="#ffffff">${esc(label)}</font></a>`;
};

function applyMessage({ to, name, token }) {
  const link = `${process.env.SITE_URL}/#token=${token}`;
  const safeName = esc(name);
  return {
    from: process.env.MAIL_FROM,
    to,
    subject: 'lost',
    text: `hi ${name}\n\nyou are invited to request access to the lost preview night\n\n03.12\n\nthis is an invite only night\n\nentry is free of charge\n\nif successful you will be part of the first group of people to see the space\n\nthe first to dance\n\nplease fill in the form attached by 02.12 at 12pm\n${link}\n\nthis link is personal to you. please do not share.\n\nlost`,
    html: layout([
      para(`hi ${safeName}`),
      para('you are invited to request access to the lost preview night'),
      para('03.12'),
      para('this is an invite only night'),
      para('entry is free of charge'),
      para('if successful you will be part of the first group of people to see the space'),
      para('the first to dance'),
      para('please fill in the form attached by 02.12 at 12pm'),
      para(linkText(link, 'request access'), false, 36),
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
    text: `hi ${name}\n\nwe have received your request for lost preview night\n\n03.12.26\n\nyou have been added to the waitlist\n\nif your place is successful you will receive a confirmation\n\nlost`,
    html: layout([
      para(`hi ${esc(name)}`),
      para('we have received your request for lost preview night'),
      para('03.12.26'),
      para('you have been added to the waitlist'),
      para('if your place is successful you will receive a confirmation'),
      para('lost', true)
    ].join('\n'))
  };
}

function inviteMessage({ to, name, token, access }) {
  const link = `${process.env.SITE_URL}/#token=${token}`;
  const safeName = esc(name);
  const queue = queueLine(access);
  return {
    from: process.env.MAIL_FROM,
    to,
    subject: 'lost opening night',
    text: `hi ${name}\n\nyour place at lost preview night 03.12 has been confirmed\n\n9pm - 3am\n\nLast entry 1am\n\n20 john princes street\nlondon\nW1G 0BJ\n\n${queue}\n\nconfirm your details and add your guests here:\n${link}\n\nthis link is personal to you. please do not share.\n\nwe missed you.\n\nsee you soon.\n\nlost`,
    html: layout([
      para(`hi ${safeName}`),
      para('your place at lost preview night 03.12 has been confirmed'),
      para('9pm - 3am'),
      para('Last entry 1am'),
      para('<a href="" style="text-decoration:none;"><font color="#ffffff">20 john princes street<br>london<br>W1G 0BJ</font></a>'),
      para(esc(queue)),
      para('confirm your details and add your guests here:'),
      para(linkText(link, 'confirm attendance'), false, 36),
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
