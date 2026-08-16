import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

/**
 * Tests the exact pass-through pattern used in live-port-proxy.mjs
 * (client -> raw TCP proxy -> target, both directions piped
 * unmodified), on isolated test-only ports/addresses so this can never
 * collide with the real reserved live-app range.
 */
test("raw TCP pass-through forwards data unmodified in both directions", async () => {
  const targetPort = 15561;
  const proxyPort = 15562;

  const targetServer = net.createServer((socket) => {
    socket.on("data", (data) => {
      socket.end(`ECHO: ${data.toString()}`);
    });
  });
  await new Promise((resolve) => targetServer.listen(targetPort, "127.0.0.9", resolve));

  const proxyServer = net.createServer((clientSocket) => {
    const upstream = net.connect(targetPort, "127.0.0.9");
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
  });
  await new Promise((resolve) => proxyServer.listen(proxyPort, "127.0.0.1", resolve));

  const result = await new Promise((resolve, reject) => {
    const client = net.connect(proxyPort, "127.0.0.1", () => {
      client.write("hello through the proxy");
    });
    client.on("data", (data) => resolve(data.toString()));
    client.on("error", reject);
  });

  assert.equal(result, "ECHO: hello through the proxy");

  await new Promise((resolve) => targetServer.close(resolve));
  await new Promise((resolve) => proxyServer.close(resolve));
});

test("a proxy with no upstream listening refuses the connection cleanly (no fabricated success)", async () => {
  const proxyPort = 15563;
  const unusedUpstreamPort = 15564; // deliberately nothing listening here

  const proxyServer = net.createServer((clientSocket) => {
    const upstream = net.connect(unusedUpstreamPort, "127.0.0.9");
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
    upstream.on("error", () => clientSocket.destroy());
  });
  await new Promise((resolve) => proxyServer.listen(proxyPort, "127.0.0.1", resolve));

  const outcome = await new Promise((resolve) => {
    const client = net.connect(proxyPort, "127.0.0.1");
    client.on("data", () => resolve("got-data"));
    client.on("close", () => resolve("closed"));
    client.on("error", () => resolve("errored"));
  });

  assert.ok(outcome === "closed" || outcome === "errored");

  await new Promise((resolve) => proxyServer.close(resolve));
});
