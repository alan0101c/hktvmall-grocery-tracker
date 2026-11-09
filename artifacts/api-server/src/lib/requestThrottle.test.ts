import test from "node:test";
import assert from "node:assert/strict";
import { createRequestThrottle } from "./requestThrottle.js";

test("starts the first request immediately and spaces later request starts", async () => {
  let currentTime = 1000;
  const delays: number[] = [];
  const requestStarts: number[] = [];
  const waitForNextRequest = createRequestThrottle(3000, {
    now: () => currentTime,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
      currentTime += milliseconds;
    },
  });

  await waitForNextRequest();
  requestStarts.push(currentTime);
  currentTime += 400;
  await waitForNextRequest();
  requestStarts.push(currentTime);
  currentTime += 1000;
  await waitForNextRequest();
  requestStarts.push(currentTime);

  assert.deepEqual(requestStarts, [1000, 4000, 7000]);
  assert.deepEqual(delays, [2600, 2000]);
});

test("does not add a delay after a request that already took longer than the interval", async () => {
  let currentTime = 0;
  let sleepCalls = 0;
  const waitForNextRequest = createRequestThrottle(3000, {
    now: () => currentTime,
    sleep: async () => {
      sleepCalls++;
    },
  });

  await waitForNextRequest();
  currentTime = 5000;
  await waitForNextRequest();

  assert.equal(sleepCalls, 0);
});

test("does not sleep when throttling is disabled", async () => {
  let sleepCalls = 0;
  const waitForNextRequest = createRequestThrottle(0, {
    sleep: async () => {
      sleepCalls++;
    },
  });

  await waitForNextRequest();
  await waitForNextRequest();

  assert.equal(sleepCalls, 0);
});
