// Message transport.
// Online: Supabase Realtime (free tier, no database tables needed).
//   - "room" channel: the projector (host) broadcasts game updates to every device.
//   - "inbox" channel: students send joins/answers that only the host receives,
//     so one student's answer isn't delivered to all 30 iPads (saves ~90% of messages).
//     Students post to the inbox with Supabase's REST broadcast endpoint, without
//     subscribing to it. If that ever fails, they fall back to the room channel.
// Local Test Mode: BroadcastChannel (tabs in the same browser only).
import { CONFIG } from './config.js';

export const isOnline = () => !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

const roomName = code => 'wr-room-' + code;
const inboxName = code => 'wr-inbox-' + code;

async function subscribe(client, name, onMessage) {
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
  return ch;
}

async function restBroadcast(topic, payload) {
  const r = await fetch(CONFIG.SUPABASE_URL.replace(/\/$/, '') + '/realtime/v1/api/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_ANON_KEY },
    body: JSON.stringify({ messages: [{ topic, event: 'm', payload, private: false }] }),
  });
  if (!r.ok) throw new Error('Broadcast failed: ' + r.status);
}

// role: 'host' or 'player'
// Returns { mode, send(msg) → everyone in room, toHost(msg, {viaRoom}) → host only, close() }
export async function openRoom(code, onMessage, role = 'player') {
  if (isOnline()) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm');
    const client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 30 } },
    });
    const room = await subscribe(client, roomName(code), onMessage);
    const channels = [room];
    if (role === 'host') channels.push(await subscribe(client, inboxName(code), onMessage));

    const sendRoom = msg => room.send({ type: 'broadcast', event: 'm', payload: msg });
    let inboxOk = true;
    return {
      mode: 'online',
      send: sendRoom,
      // Host-only message. Uses the inbox unless it has failed or the caller asks for the room.
      toHost: async (msg, { viaRoom = false } = {}) => {
        if (viaRoom || !inboxOk) return sendRoom(msg);
        try { await restBroadcast(inboxName(code), msg); }
        catch (e) { console.warn('Inbox unavailable, using room channel', e); inboxOk = false; sendRoom(msg); }
      },
      useRoomForHost: () => { inboxOk = false; },
      close: () => channels.forEach(ch => client.removeChannel(ch)),
    };
  }
  const bc = new BroadcastChannel(roomName(code));
  bc.onmessage = e => onMessage(e.data);
  const send = msg => bc.postMessage(msg);
  return { mode: 'local', send, toHost: send, useRoomForHost: () => {}, close: () => bc.close() };
}
