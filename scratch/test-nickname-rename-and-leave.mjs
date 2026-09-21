import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://azdhaulwcabrrgcanbsq.supabase.co";
const SUPABASE_KEY = "sb_publishable_PK8F030-iu0VYi3SI2N2bw_dYJFBD8C";

const clientA = createClient(SUPABASE_URL, SUPABASE_KEY);
const clientB = createClient(SUPABASE_URL, SUPABASE_KEY);

const code = "NICK" + Math.floor(100 + Math.random() * 900);
const presenceTopic = "room:" + code;

console.log("[Test] Room topic:", presenceTopic);

const presA = clientA.channel(presenceTopic, { config: { presence: { key: "user-A" } } });
const presB = clientB.channel(presenceTopic, { config: { presence: { key: "user-B" } } });

let userAJoinEvents = [];
let userARenameEvents = [];
let userALeaveEvents = [];
let userBJoinEvents = [];

let hasCompletedInitialSyncA = false;
let hasCompletedInitialSyncB = false;

const knownMemberIdsA = new Set();
const knownMembersCacheA = new Map();

const knownMemberIdsB = new Set();
const knownMembersCacheB = new Map();

function syncMembersA() {
  const isFirstSync = !hasCompletedInitialSyncA;
  if (isFirstSync) hasCompletedInitialSyncA = true;

  const state = presA.presenceState();
  Object.entries(state).forEach(([key, metas]) => {
    const m = metas?.[0] || {};
    const uid = m.id || key;
    if (!uid) return;
    const rawNick = String(m.nickname || "").trim();
    const cleanNick = rawNick && rawNick !== "false" ? rawNick : "Guest";

    knownMembersCacheA.set(uid, { id: uid, nickname: cleanNick });

    if (!knownMemberIdsA.has(uid) && uid !== "user-A") {
      knownMemberIdsA.add(uid);
      if (!isFirstSync) {
        userAJoinEvents.push({ uid, nick: cleanNick });
      }
    }
  });
}

function syncMembersB() {
  const isFirstSync = !hasCompletedInitialSyncB;
  if (isFirstSync) hasCompletedInitialSyncB = true;

  const state = presB.presenceState();
  Object.entries(state).forEach(([key, metas]) => {
    const m = metas?.[0] || {};
    const uid = m.id || key;
    if (!uid) return;
    const rawNick = String(m.nickname || "").trim();
    const cleanNick = rawNick && rawNick !== "false" ? rawNick : "Guest";

    knownMembersCacheB.set(uid, { id: uid, nickname: cleanNick });

    if (!knownMemberIdsB.has(uid) && uid !== "user-B") {
      knownMemberIdsB.add(uid);
      // Suppressed during first sync!
      if (!isFirstSync) {
        userBJoinEvents.push({ uid, nick: cleanNick });
      }
    }
  });
}

presA.on("presence", { event: "sync" }, () => syncMembersA());
presA.on("broadcast", { event: "member_joined" }, ({ payload }) => {
  const raw = String(payload.nickname || "").trim();
  const clean = raw && raw !== "false" ? raw : "A listener";
  if (!knownMemberIdsA.has(payload.id)) {
    knownMemberIdsA.add(payload.id);
    userAJoinEvents.push({ uid: payload.id, nick: clean });
  }
});

presA.on("broadcast", { event: "member_rename" }, ({ payload }) => {
  console.log("[User A] received member_rename:", payload);
  userARenameEvents.push(payload);
  if (payload?.userId) {
    knownMembersCacheA.set(payload.userId, { id: payload.userId, nickname: payload.newNickname });
  }
});

presA.on("broadcast", { event: "member_left" }, ({ payload }) => {
  console.log("[User A] received member_left:", payload);
  const cached = knownMembersCacheA.get(payload.userId);
  const raw = String(payload.nickname || cached?.nickname || "").trim();
  const clean = raw && raw !== "false" ? raw : "A member";
  userALeaveEvents.push({ uid: payload.userId, nick: clean });
  knownMembersCacheA.delete(payload.userId);
  knownMemberIdsA.delete(payload.userId);
});

presB.on("presence", { event: "sync" }, () => syncMembersB());

async function runTest() {
  // Step 1: User A subscribes as Alice
  await new Promise((res) => presA.subscribe((s) => s === "SUBSCRIBED" && res()));
  await presA.track({ id: "user-A", nickname: "Alice", role: "owner" });
  console.log("[Test] User A (Alice) tracked presence");
  await new Promise((r) => setTimeout(r, 1000));

  // Step 2: User B subscribes as Bob
  await new Promise((res) => presB.subscribe((s) => s === "SUBSCRIBED" && res()));
  await presB.track({ id: "user-B", nickname: "Bob", role: "member" });
  await presB.send({
    type: "broadcast",
    event: "member_joined",
    payload: { id: "user-B", nickname: "Bob", role: "member" },
  });
  console.log("[Test] User B (Bob) joined and tracked");
  await new Promise((r) => setTimeout(r, 2000));

  console.log("[Check 1] User A join events:", userAJoinEvents);
  console.log("[Check 1] User B join events (should be 0 because Alice was already there):", userBJoinEvents);

  if (userBJoinEvents.length > 0) {
    console.error("FAIL: User B received false join event for existing occupant Alice!");
    process.exit(1);
  }

  if (userAJoinEvents.length === 0 || userAJoinEvents[0].nick !== "Bob") {
    console.error("FAIL: User A did not receive clean join event for Bob!");
    process.exit(1);
  }

  // Step 3: User B renames to "Bob The Great"
  console.log("[Test] User B renaming to 'Bob The Great'...");
  await presB.send({
    type: "broadcast",
    event: "member_rename",
    payload: { userId: "user-B", oldNickname: "Bob", newNickname: "Bob The Great" },
  });
  await presB.track({ id: "user-B", nickname: "Bob The Great", role: "member" });
  await new Promise((r) => setTimeout(r, 2000));

  console.log("[Check 2] User A rename events:", userARenameEvents);
  if (userARenameEvents.length === 0 || userARenameEvents[0].newNickname !== "Bob The Great") {
    console.error("FAIL: User A did not receive clean rename event for Bob The Great!");
    process.exit(1);
  }

  // Step 4: User B leaves
  console.log("[Test] User B leaving room...");
  await presB.send({
    type: "broadcast",
    event: "member_left",
    payload: { userId: "user-B", nickname: "Bob The Great" },
  });
  await presB.untrack();
  await new Promise((r) => setTimeout(r, 3000));

  console.log("[Check 3] User A leave events:", userALeaveEvents);
  if (userALeaveEvents.length === 0 || userALeaveEvents[0].nick !== "Bob The Great") {
    console.error("FAIL: User A leave event has wrong name or failed!", userALeaveEvents);
    process.exit(1);
  }

  console.log("SUCCESS: All user name updates, joins, renames, and leaves verified perfectly!");
  clientA.removeAllChannels();
  clientB.removeAllChannels();
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
