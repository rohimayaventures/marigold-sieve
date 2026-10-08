// Cloudflare Worker entry point.
import { handleRequest } from './app.js';

export default {
  async fetch(request, env, ctx) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const log = async (row) => {
      console.log(JSON.stringify(row)); // visible with `npx wrangler tail`
      if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
        const { zendesk_ticket, ...dbRow } = row;
        const p = fetch(`${env.SUPABASE_URL}/rest/v1/compliance_runs`, {
          method: 'POST',
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'content-type': 'application/json',
            prefer: 'return=minimal',
          },
          body: JSON.stringify(dbRow),
        }).catch(() => {});
        ctx.waitUntil(p);
      }
    };
    return handleRequest(request, env, { log, ip, rateLimit: true });
  },
};
