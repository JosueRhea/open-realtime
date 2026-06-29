import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { chromium, type Browser, type Page } from "playwright";
import { createNodeServer } from "../runtime/create-node-server";
import type { RuntimeConfig } from "../runtime/config";

const credentials = {
  appId: "frontend-smoke",
  key: "frontend-smoke-key",
  secret: "frontend-smoke-secret",
  cluster: "mt1",
};

const steps: string[] = [];

async function main(): Promise<void> {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const config: RuntimeConfig = {
    pusher: credentials,
    apps: [credentials],
    appRegistry: {
      source: "static",
      refreshIntervalMs: 10000,
    },
    redisPrefix: "frontend-smoke",
    observability: {
      driver: "none",
      service: "open-realtime",
      environment: "test",
      instanceId: "frontend-smoke",
      batchSize: 100,
      flushIntervalMs: 1000,
      maxQueueSize: 10000,
    },
    webhookUrls: [`${baseUrl}/example/webhooks`],
    webhookEvents: new Set(["channel_occupied", "channel_vacated", "member_added", "member_removed"]),
    webhookBatchSize: 20,
    webhookFlushIntervalMs: 50,
    orchestrator: {
      tenantId: "self-hosted",
      flushIntervalMs: 0,
    },
    port,
  };
  const server = await createNodeServer(config);
  await listen(server, port);

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const firstPage = await browser.newPage();
    const secondPage = await browser.newPage();
    await firstPage.goto(`${baseUrl}/example`, { waitUntil: "domcontentloaded" });
    await secondPage.goto(`${baseUrl}/example`, { waitUntil: "domcontentloaded" });

    await expectText(firstPage, "#status", "connected");
    await expectText(secondPage, "#status", "connected");
    await expectText(firstPage, "#log", "subscribed public-example");
    await expectText(firstPage, "#log", "subscribed private-example");
    await expectText(firstPage, "#log", "subscribed presence-example");
    await expectText(secondPage, "#log", "subscribed presence-example");
    ok("frontend opened two tabs and each tab connected one real browser pusher-js client");

    await firstPage.getByRole("button", { name: "Server trigger" }).click();
    await expectText(firstPage, "#log", "received server:single");
    await expectText(secondPage, "#log", "received server:single");
    ok("frontend received official server SDK single trigger");

    await firstPage.getByRole("button", { name: "Batch trigger" }).click();
    await expectText(firstPage, "#log", "received server:batch");
    await expectText(secondPage, "#log", "received server:batch");
    ok("frontend received official server SDK batch trigger");

    await firstPage.getByRole("button", { name: "Client event" }).click();
    await expectText(firstPage, "#log", "triggered client-live-test");
    await expectText(secondPage, "#log", "received client-live-test");
    ok("frontend sent client-* event from one tab and received it in the other tab");

    await firstPage.getByRole("button", { name: "Send to user" }).click();
    await expectText(firstPage, "#log", "received user:direct");
    ok("frontend received sendToUser event for its signed-in user");

    await firstPage.getByRole("button", { name: "Presence users" }).click();
    await expectText(firstPage, "#log", "presence users");
    await expectText(firstPage, "#log", "example-tab-");
    await expectText(firstPage, "#presence", "2 member(s)");
    ok("frontend fetched presence users through server SDK helper");

    await secondPage.getByRole("button", { name: "Terminate user" }).click();
    await expectText(secondPage, "#status", "disconnected");
    await expectText(firstPage, "#status", "connected");
    ok("frontend terminated one signed-in user's connection without closing the other tab");

    await firstPage.getByRole("button", { name: "Disconnect" }).click();
    await expectWebhookText(firstPage, "member_added");
    await expectWebhookText(firstPage, "member_removed");
    ok("frontend displayed webhook batches captured by the server");

    console.log(`\nFrontend smoke passed against ${baseUrl}`);
    for (const step of steps) console.log(`- ${step}`);
  } finally {
    await browser?.close();
    await close(server);
  }
}

async function expectText(page: Page, selector: string, expected: string, timeoutMs = 7000): Promise<void> {
  const started = Date.now();
  let lastText = "";
  while (Date.now() - started < timeoutMs) {
    lastText = await page.locator(selector).textContent().catch(() => "") ?? "";
    if (lastText.includes(expected)) return;
    await page.waitForTimeout(80);
  }
  throw new Error(`Expected ${selector} to contain "${expected}". Last text: ${lastText}`);
}

async function expectWebhookText(page: Page, expected: string, timeoutMs = 7000): Promise<void> {
  const started = Date.now();
  let lastText = "";
  while (Date.now() - started < timeoutMs) {
    await page.getByRole("button", { name: "Refresh webhooks" }).click();
    lastText = (await page.locator("#webhooks").textContent().catch(() => "")) ?? "";
    if (lastText.includes(expected)) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Expected #webhooks to contain "${expected}". Last text: ${lastText}`);
}

function ok(message: string): void {
  steps.push(message);
}

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

function listen(server: Awaited<ReturnType<typeof createNodeServer>>, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
}

function close(server: Awaited<ReturnType<typeof createNodeServer>>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

await main();
