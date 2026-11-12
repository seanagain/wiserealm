// Message transport.
// Online: Supabase Realtime broadcast (free tier, no database tables needed).
// Local Test Mode: BroadcastChannel (tabs in the same browser only).
import { CONFIG } from './config.js';

export const isOnline = () => !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

export async function openRoom(code, onMessage) {
  const name = 'cq-room-' + code;
  if (isOnline()) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm');
    const client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 30 } },
    });
    const ch = client.channel(name, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'm' }, ({ payload }) => onMessage(payload));
    await new Promise((resolve, reject) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; reject(new Error('Connection timed out')); } }, 12000);
      ch.subscribe(status => {
        if (done) return;
        if (status === 'SUBSCRIBED') { done = true; clearTimeout(t); resolve(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { done = true; clearTimeout(t); reject(new Error(status)); }
      });
    });
    return {
      mode: 'online',
      send: msg => ch.send({ type: 'broadcast', event: 'm', payload: msg }),
      close: () => client.removeChannel(ch),
    };
  }
  const bc = new BroadcastChannel(name);
  bc.onmessage = e => onMessage(e.data);
  return { mode: 'local', send: msg => bc.postMessage(msg), close: () => bc.close() };
}
