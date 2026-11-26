# lost guest list

invite-tree rsvp for the opening of lost (03.12.26). capacity 1400, three levels, max 3 guests each by default.

## stack
- frontend: index.html (static, vercel)
- api: /api (vercel serverless functions, node)
- database: supabase postgres (supabase/schema.sql)
- email: resend

## env vars (vercel)
SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, MAIL_FROM, ADMIN_SECRET, SITE_URL (see .env.example)

## routes
GET /api/invite, POST /api/confirm, POST /api/guests
GET /api/admin/list, POST /api/admin/seed, POST /api/admin/revoke  (header x-admin-secret)

## todo
- rate limiting / turnstile on guest endpoints
- resend plan that covers 1400+ emails
- test end to end with a real address
- open index.html locally or add ?mock to see the demo mode
