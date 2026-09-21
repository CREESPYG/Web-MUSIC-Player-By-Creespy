import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://azdhaulwcabrrgcanbsq.supabase.co";
const SUPABASE_KEY = "sb_publishable_PK8F030-iu0VYi3SI2N2bw_dYJFBD8C";

const clientHost = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 50 }, heartbeatIntervalMs: 5000 },
});

const clientGuest = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 50 }, heartbeatIntervalMs: 5000 },
});

const roomCode = "LIVE" + Math.floor(100 + Math.random() * 900);
const chatChannel = `room:${roomCode}:chat`;
const presenceChannel = `room:${roomCode}`;

console.log("Testing Chat Delivery Status, Typing Indicators & Join/Left on:", roomCode);

const hostChatCh = clientHost.channel(chatChannel, { config: { broadcast: { self: false } } });
const hostPresCh = clientHost.channel(presenceChannel, { config: { presence: { key: "host-1" }, broadcast: { self: false } } });

const guestChatCh = clientGuest.channel(chatChannel, { config: { broadcast: { self: false } } });
const guestPresCh = clientGuest.channel(presenceChannel, { config: { presence: { key: "guest-1" }, broadcast: { self: false } } });

let typingReceived = false;
let messageAckReceived = false;
let guestGotJoinEvent = false;

// Host listens for acks & typing
hostChatCh.on("broadcast", { event: "chat_ack" }, ({ payload }) => {
  console.log("✓ Host received chat_ack:", payload);
  if (payload?.msgId === "msg-status-test" && payload?.status === "read") {
    messageAckReceived = true;
  }
});

hostChatCh.on("broadcast", { event: "typing" }, ({ payload }) => {
  console.log("✓ Host received typing broadcast from:", payload?.nickname, "typing:", payload?.typing);
  if (payload?.typing === true) {
    typingReceived = true;
  }
});

// Guest receives chat and automatically acks it
guestChatCh.on("broadcast", { event: "chat" }, async ({ payload }) => {
  console.log("✓ Guest received chat:", payload.message);
  // Send back read ack
  await guestChatCh.send({
    type: "broadcast",
    event: "chat_ack",
    payload: { msgId: payload.id, readerId: "guest-1", status: "read" },
  });
  console.log("✓ Guest sent chat_ack back to Host");
});

guestPresCh.on("presence", { event: "join" }, ({ newPresences }) => {
  console.log("✓ Guest saw participant join in presence:", newPresences.map(p => p.nickname));
  guestGotJoinEvent = true;
});

async function run() {
  await Promise.all([
    new Promise(r => hostChatCh.subscribe(s => s === "SUBSCRIBED" && r())),
    new Promise(r => hostPresCh.subscribe(s => s === "SUBSCRIBED" && r())),
    new Promise(r => guestChatCh.subscribe(s => s === "SUBSCRIBED" && r())),
    new Promise(r => guestPresCh.subscribe(s => s === "SUBSCRIBED" && r())),
  ]);

  console.log("Subscribed to channels!");

  // 1. Host tracks presence
  await hostPresCh.track({ id: "host-1", nickname: "SuperHost", role: "owner" });

  // 2. Guest broadcasts typing
  await guestChatCh.send({
    type: "broadcast",
    event: "typing",
    payload: { userId: "guest-1", nickname: "HappyListener", typing: true },
  });

  // 3. Host sends chat message
  await hostChatCh.send({
    type: "broadcast",
    event: "chat",
    payload: { id: "msg-status-test", userId: "host-1", nickname: "SuperHost", message: "Testing read receipts!", status: "sent" },
  });

  // 4. Guest tracks presence (join event)
  await guestPresCh.track({ id: "guest-1", nickname: "HappyListener", role: "member" });

  setTimeout(() => {
    console.log("\n=== Test Results ===");
    console.log("Typing received:", typingReceived);
    console.log("Message Ack / Read receipt received:", messageAckReceived);
    console.log("Presence Join Event received:", guestGotJoinEvent);

    if (typingReceived && messageAckReceived && guestGotJoinEvent) {
      console.log("✅ ALL TESTS PASSED!");
      process.exit(0);
    } else {
      console.error("❌ Some tests failed");
      process.exit(1);
    }
  }, 2500);
}

run().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
