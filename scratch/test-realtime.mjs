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

const roomCode = "TEST" + Math.floor(Math.random() * 1000);
const channelName = `room:${roomCode}`;

console.log("Testing Supabase Realtime Broadcast on channel:", channelName);

const chA = clientA.channel(channelName, {
  config: { presence: { key: "userA" }, broadcast: { self: false } },
});

const chB = clientB.channel(channelName, {
  config: { presence: { key: "userB" }, broadcast: { self: false } },
});

let receivedA = 0;
let receivedB = 0;

chA.on("broadcast", { event: "chat" }, ({ payload }) => {
  console.log("[Client A received broadcast]", payload);
  receivedA++;
});

chB.on("broadcast", { event: "chat" }, ({ payload }) => {
  console.log("[Client B received broadcast]", payload);
  receivedB++;
});

chA.subscribe(async (status) => {
  console.log("Client A status:", status);
  if (status === "SUBSCRIBED") {
    console.log("Client A sending message 1...");
    const res = await chA.send({
      type: "broadcast",
      event: "chat",
      payload: { id: "msg-1", userId: "userA", nickname: "User A", message: "Hello from A!" },
    });
    console.log("Client A send result:", res);
  }
});

chB.subscribe(async (status) => {
  console.log("Client B status:", status);
  if (status === "SUBSCRIBED") {
    setTimeout(async () => {
      console.log("Client B sending message 2...");
      const res = await chB.send({
        type: "broadcast",
        event: "chat",
        payload: { id: "msg-2", userId: "userB", nickname: "User B", message: "Hello from B!" },
      });
      console.log("Client B send result:", res);
    }, 1000);
  }
});

setTimeout(() => {
  console.log(`Summary: Received by A: ${receivedA}, Received by B: ${receivedB}`);
  process.exit(0);
}, 5000);
