import net from "node:net";
import {
  LIVE_PORT_RANGE_START,
  LIVE_PORT_RANGE_SIZE,
} from "./lib/live-port-registry.mjs";

/**
 * Starts one raw TCP pass-through server per port in the reserved live
 * app range (BUGS_AND_FIXES.md #56). Each one forwards every byte,
 * unmodified, to the SAME port number on the agent-canvas container -
 * so a browser connecting to MKDD's own host on e.g. port 4005 is
 * transparently talking to whatever an employee bound to port 4005
 * inside their sandbox, byte for byte. Because the app is reached at
 * what looks exactly like its own root (no subpath prefix, no
 * rewriting), there is no absolute-path convention that can ever
 * "escape" this proxy - the entire class of bugs the previous
 * subpath+rewrite approach kept running into (asset paths, then API
 * paths, and whatever framework convention would have come up next)
 * simply cannot occur here.
 *
 * A port with nothing currently listening on the agent-canvas side
 * just refuses the connection normally - the browser sees a plain
 * connection-refused, an honest signal rather than a fabricated
 * success, matching README section 47's "never fabricate" principle.
 */
export function startLivePortProxies() {
  const host = new URL(process.env.OPENHANDS_URL).hostname;

  for (let i = 0; i < LIVE_PORT_RANGE_SIZE; i++) {
    const port = LIVE_PORT_RANGE_START + i;

    const server = net.createServer((clientSocket) => {
      const upstream = net.connect(port, host);

      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);

      // Either side closing/erroring should tear down both ends of the
      // pair - otherwise a half-open connection would leak indefinitely.
      const cleanup = () => {
        clientSocket.destroy();
        upstream.destroy();
      };
      clientSocket.on("error", cleanup);
      upstream.on("error", cleanup);
      clientSocket.on("close", cleanup);
      upstream.on("close", cleanup);
    });

    server.on("error", (err) => {
      console.error(`live-port-proxy: port ${port} failed to start:`, err.message);
    });

    server.listen(port, "0.0.0.0");
  }

  console.log(
    `MKDD live-app proxies ready on ports ${LIVE_PORT_RANGE_START}-${LIVE_PORT_RANGE_START + LIVE_PORT_RANGE_SIZE - 1}`,
  );
}
