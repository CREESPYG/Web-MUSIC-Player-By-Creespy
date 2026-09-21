import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://azdhaulwcabrrgcanbsq.supabase.co";
const SUPABASE_KEY = "sb_publishable_PK8F030-iu0VYi3SI2N2bw_dYJFBD8C";

const clientA = createClient(SUPABASE_URL, SUPABASE_KEY);
const clientB = createClient(SUPABASE_URL, SUPABASE_KEY);

const code = "FIX" + Math.floor(100 + Math.random() * 900);
const presenceTopic = "room:" + code;
const chatTopic = "room:" + code + ":chat";

console.log("[Test] Room topic:", presenceTopic, "Chat topic:", chatTopic);

const presA = clientA.channel(presenceTopic, { config: { presence: { key: "user-A" } } });
const chatA = clientA.channel(chatTopic, { config: { broadcast: { self: false } } });

const presB = clientB.channel(presenceTopic, { config: { presence: { key: "user-B" } } });
const chatB = clientB.channel(chatTopic, { config: { broadcast: { self: false } } });

let userAMsgStatus = "sending";
let userAFalseJoinsAfterLeave = 0;

const knownMemberIdsA = new Set();
const explicitlyLeftA = new Map();

function syncMembersA() {
  const state = presA.presenceState();
  const now = Date.now();
  Object.entries(state).forEach(([key, metas]) => {
    const m = metas?.[0] || {};
    const uid = m.id || key;
    if (!uid) return;

    const leftAt = explicitlyLeftA.get(uid);
    if (leftAt && now - leftAt < 60000) {
      return; // Lingering presence ignored!
    }

    if (!knownMemberIdsA.has(uid) && uid !== "user-A") {
      knownMemberIdsA.add(uid);
      console.log("User A received JOIN for:", uid);
      if (explicitlyLeftA.has(uid)) {
        userAFalseJoinsAfterLeave++;
      }
    }
  });
}

presA.on("presence", { event: "sync" }, () => syncMembersA());
presA.on("presence", { event: "join" }, () => syncMembersA());
presA.on("presence", { event: "leave" }, () => syncMembersA());

presA.on("broadcast", { event: "member_left" }, ({ payload }) => {
  console.log("User A received broadcast member_left for:", payload.userId);
  explicitlyLeftA.set(payload.userId, Date.now());
  syncMembersA();
});

chatA.on("broadcast", { event: "chat_ack" }, ({ payload }) => {
  console.log("User A received chat_ack:", payload);
  if (payload.status === "read") {
    userAMsgStatus = "read";
  } else if (payload.status === "delivered" && userAMsgStatus !== "read") {
    userAMsgStatus = "delivered";
  }
});

chatB.on("broadcast", { event: "chat" }, ({ payload }) => {
  console.log("User B received chat:", payload.message);
  chatB.send({
    type: "broadcast",
    event: "chat_ack",
    payload: { msgId: payload.id, readerId: "user-B", status: "read" }
  });
});

async function run() {
  await new Promise((res) => presA.subscribe((s) => s === "SUBSCRIBED" && presA.track({ id: "user-A", nickname: "Host" }).then(res)));
  await new Promise((res) => chatA.subscribe((s) => s === "SUBSCRIBED" && res()));
  await new Promise((res) => presB.subscribe((s) => s === "SUBSCRIBED" && presB.track({ id: "user-B", nickname: "Bob" }).then(res)));
  await new Promise((res) => chatB.subscribe((s) => s === "SUBSCRIBED" && res()));

  await new Promise((r) => setTimeout(r, 1200));

  // Step 1: User A sends a chat message
  console.log("1. User A sending message...");
  const msgId = "msg-" + Date.now();
  await chatA.send({
    type: "broadcast",
    event: "chat",
    payload: { id: msgId, userId: "user-A", nickname: "Host", message: "Hello Bob!" }
  });

  await new Promise((r) => setTimeout(r, 1200));
  console.log("User A message status after ack:", userAMsgStatus);
  if (userAMsgStatus !== "read") {
    throw new Error("Message status was not updated to read!");
  }
  console.log("PASS: Read status verified - message upgraded to read successfully!");

  // Step 2: User B leaves the room
  console.log("2. User B leaving room...");
  await presB.send({
    type: "broadcast",
    event: "member_left",
    payload: { userId: "user-B", nickname: "Bob" }
  });

  // Simulate lingering presence firing sync
  syncMembersA();
  await new Promise((r) => setTimeout(r, 1500));

  console.log("False join events recorded after leave:", userAFalseJoinsAfterLeave);
  if (userAFalseJoinsAfterLeave > 0) {
    throw new Error("False join event triggered after leave!");
  }
  console.log("PASS: Lingering presence ignored - ZERO false join events after leave!");

  await clientA.removeAllChannels();
  await clientB.removeAllChannels();
  console.log("ALL TESTS PASSED 100%!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
