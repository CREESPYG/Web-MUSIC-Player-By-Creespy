import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://azdhaulwcabrrgcanbsq.supabase.co";
const SUPABASE_KEY = "sb_publishable_PK8F030-iu0VYi3SI2N2bw_dYJFBD8C";

const clientA = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: {
    params: { eventsPerSecond: 50 },
    heartbeatIntervalMs: 5000,
  },
});

const clientB = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: {
    params: { eventsPerSecond: 50 },
    heartbeatIntervalMs: 5000,
  },
});

const roomCode = "PRES" + Math.floor(Math.random() * 1000);
const channelName = `room:${roomCode}`;

console.log("Testing Presence Sync on:", channelName);

const chA = clientA.channel(channelName, {
  config: { presence: { key: "user-A-id" }, broadcast: { self: false } },
});

const chB = clientB.channel(channelName, {
  config: { presence: { key: "user-B-id" }, broadcast: { self: false } },
});

chA.on("presence", { event: "sync" }, () => {
  const state = chA.presenceState();
  console.log("Client A presenceState:", Object.keys(state));
});

chB.on("presence", { event: "sync" }, () => {
  const state = chB.presenceState();
  console.log("Client B presenceState:", Object.keys(state));
});

chA.subscribe(async (status) => {
  console.log("Client A channel status:", status);
  if (status === "SUBSCRIBED") {
    const tr = await chA.track({ id: "user-A-id", nickname: "Host Alice", role: "owner" });
    console.log("Client A tracked:", tr);
  }
});

setTimeout(() => {
  chB.subscribe(async (status) => {
    console.log("Client B channel status:", status);
    if (status === "SUBSCRIBED") {
      const tr = await chB.track({ id: "user-B-id", nickname: "Member Bob", role: "member" });
      console.log("Client B tracked:", tr);
    }
  });
}, 1000);

setTimeout(() => {
  console.log("Final state on A:", JSON.stringify(chA.presenceState()));
  console.log("Final state on B:", JSON.stringify(chB.presenceState()));
  process.exit(0);
}, 5000);
