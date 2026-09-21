import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://azdhaulwcabrrgcanbsq.supabase.co";
const SUPABASE_KEY = "sb_publishable_PK8F030-iu0VYi3SI2N2bw_dYJFBD8C";

const clientA = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 50 }, heartbeatIntervalMs: 5000 },
});

const clientB = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 50 }, heartbeatIntervalMs: 5000 },
});

const code = "LOAD" + Math.floor(100 + Math.random() * 900);
const presenceTopic = `room:${code}`;
const chatTopic = `room:${code}:chat`;
const syncTopic = `room:${code}:sync`;

console.log(`[Test] Partitioned Topics: Presence=${presenceTopic}, Chat=${chatTopic}, Sync=${syncTopic}`);

// Client A channels (Host)
const presA = clientA.channel(presenceTopic, { config: { presence: { key: "host-uid" }, broadcast: { self: false } } });
const chatA = clientA.channel(chatTopic, { config: { broadcast: { self: false } } });
const syncA = clientA.channel(syncTopic, { config: { broadcast: { self: false } } });

// Client B channels (Member)
const presB = clientB.channel(presenceTopic, { config: { presence: { key: "member-uid" }, broadcast: { self: false } } });
const chatB = clientB.channel(chatTopic, { config: { broadcast: { self: false } } });
const syncB = clientB.channel(syncTopic, { config: { broadcast: { self: false } } });

let chatMsgsReceived = 0;
let syncEventsReceived = 0;
let presenceSynced = false;

chatB.on("broadcast", { event: "chat" }, ({ payload }) => {
  console.log("✓ Member received chat broadcast:", payload.message);
  chatMsgsReceived++;
});

syncB.on("broadcast", { event: "playback" }, ({ payload }) => {
  console.log("✓ Member received playback sync broadcast:", payload.title, "@", payload.position);
  syncEventsReceived++;
});

syncB.on("broadcast", { event: "queue_update" }, ({ payload }) => {
  console.log("✓ Member received queue sync broadcast, count:", payload.length);
  syncEventsReceived++;
});

presB.on("presence", { event: "sync" }, () => {
  const state = presB.presenceState();
  if (state["host-uid"]) {
    presenceSynced = true;
    console.log("✓ Member verified Host presence in room");
  }
});

async function run() {
  await Promise.all([
    new Promise((resolve) => presA.subscribe((s) => s === "SUBSCRIBED" && resolve())),
    new Promise((resolve) => chatA.subscribe((s) => s === "SUBSCRIBED" && resolve())),
    new Promise((resolve) => syncA.subscribe((s) => s === "SUBSCRIBED" && resolve())),
    new Promise((resolve) => presB.subscribe((s) => s === "SUBSCRIBED" && resolve())),
    new Promise((resolve) => chatB.subscribe((s) => s === "SUBSCRIBED" && resolve())),
    new Promise((resolve) => syncB.subscribe((s) => s === "SUBSCRIBED" && resolve())),
  ]);

  console.log("All 6 channel subscriptions active!");

  // Track host presence
  await presA.track({ id: "host-uid", nickname: "SuperHost", role: "owner" });
  await presB.track({ id: "member-uid", nickname: "ListenerOne", role: "member" });

  // Send simultaneous chat and playback/queue updates to test load balancing
  console.log("Broadcasting simultaneous chat + playback + queue updates...");
  
  await Promise.all([
    chatA.send({
      type: "broadcast",
      event: "chat",
      payload: { id: "c1", userId: "host-uid", nickname: "SuperHost", message: "Welcome to the balanced room!" },
    }),
    syncA.send({
      type: "broadcast",
      event: "playback",
      payload: { videoId: "v123", title: "Awesome Track", artist: "Cool Artist", isPlaying: true, position: 42, ts: Date.now(), by: "host-uid" },
    }),
    syncA.send({
      type: "broadcast",
      event: "queue_update",
      payload: [{ videoId: "v123", title: "Awesome Track" }, { videoId: "v456", title: "Next Hit" }],
    }),
  ]);

  setTimeout(() => {
    console.log(`\n=== Verification Results ===`);
    console.log(`Chat messages received: ${chatMsgsReceived}/1`);
    console.log(`Sync events received: ${syncEventsReceived}/2`);
    console.log(`Presence synced: ${presenceSynced}`);

    if (chatMsgsReceived === 1 && syncEventsReceived === 2) {
      console.log("✅ TEST PASSED: Load-balanced partitioned channels working flawlessly!");
      process.exit(0);
    } else {
      console.error("❌ TEST FAILED: Missing messages");
      process.exit(1);
    }
  }, 2000);
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
