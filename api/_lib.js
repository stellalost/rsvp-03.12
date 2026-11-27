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
const layout = (inner) => `<html><head><meta name="format-detection" content="address=no,telephone=no"></head><body style="margin:0;padding:0;background:#000;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#000000" style="background:#000;color:#fff;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:1.2;">
<tr><td align="center" bgcolor="#000000" style="padding:96px 28px 120px;text-align:center;">
<table role="presentation" align="center" width="280" cellpadding="0" cellspacing="0" style="width:280px;max-width:280px;margin:0 auto;">
<tr><td align="center" style="text-align:center;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:1.2;color:#fff;">
${inner}
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
const button = (link, label) => {
  const safe = esc(link);
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:36px auto 22px;"><tr><td align="center" bgcolor="#000000" style="border:1px solid #ffffff;background:#000000;"><a href="${safe}" style="display:inline-block;padding:10px 22px;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:1.2;color:#ffffff;text-decoration:none;background:#000000;border:1px solid #ffffff;"><font color="#ffffff">${esc(label)}</font></a></td></tr></table>`;
};

function applyMessage({ to, name, token }) {
  const link = `${process.env.SITE_URL}/#token=${token}`;
  const safeName = esc(name);
  return {
    from: process.env.MAIL_FROM,
    to,
    subject: 'lost preview night',
    text: `hi ${name}\n\nyou are invited to the lost preview night on 03.12\n\nplease fill in the form attached by 02.12 at 12pm\n\nenter\n${link}\n\nyou will be the first to enter\n\nlost`,
    html: layout([
      para(`hi ${safeName}`),
      para('you are invited to the lost preview night on 03.12'),
      para('please fill in the form attached by 02.12 at 12pm'),
      button(link, 'enter'),
      para('you will be the first to enter'),
      para('lost', true)
    ].join('\n'))
  };
}

function ackMessage({ to, name }) {
  return {
    from: process.env.MAIL_FROM,
    to,
    subject: 'lost request',
    text: `hi ${name}\n\nwe have received your reply for lost preview night\n\nyou will be notified shortly with next steps\n\n03.12\n\nlost`,
    html: layout([
      para(`hi ${esc(name)}`),
      para('we have received your reply for lost preview night'),
      para('you will be notified shortly with next steps'),
      para('03.12'),
      para('lost', true)
    ].join('\n'))
  };
}

function inviteMessage({ to, name, token, access }) {
  const link = `${process.env.SITE_URL}/#token=${token}`;
  const safeName = esc(name);
  const tier = (access || 'standard').toLowerCase();
  const letter = { vvip: 'A', vip: 'B', standard: 'C' }[tier] || 'C';
  const confirmed = tier === 'standard'
    ? 'your place at lost preview night has been confirmed'
    : 'your place at lost preview night 03.12 has been confirmed';
  const queue = `please join the ${letter} queue`;
  const note = 'this evening is designed to help test our systems. prompt arrival is important. you will be the first to enter lost 02. your participation for this evening helps to prepare for opening night.';
  const address = tier === 'vip';
  const lines = [
    `hi ${name}`,
    '',
    confirmed,
    '',
    '9pm - 3am',
    '',
    'last entry 1am',
    ''
  ];
  if (address) lines.push('20 john princes street', 'london', 'W1G 0BJ', '');
  lines.push(queue, '', `confirm attendance\n${link}`, '', 'we missed you.', '', 'see you soon.', '', 'lost', '', 'note on our preview night:', '', note);
  const html = [
    para(`hi ${safeName}`),
    para(confirmed),
    para('9pm - 3am'),
    para('last entry 1am')
  ];
  if (address) html.push(para('<a href="" style="text-decoration:none;"><font color="#ffffff">20 john princes street<br>london<br>W1G 0BJ</font></a>'));
  html.push(
    para(queue),
    para(linkText(link, 'confirm attendance'), false, 36),
    para('we missed you.'),
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
