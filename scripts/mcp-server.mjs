import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const WS_URL = "ws://127.0.0.1:8787/ws";
const HUMAN_ACTION_TIMEOUT_MS = 5 * 60 * 1000;

function sendBridgeRequest(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type, payload }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.type === type ||
          (type === "get_console_errors" && data.type === "console_errors") ||
          (type === "validation_collect_trace_bundle" && data.type === "validation_collect_trace_bundle_result")
        ) {
          ws.close();
          resolve(data);
        }
      } catch (err) {
        // ignore
      }
    };

    ws.onerror = (err) => {
      reject(err);
    };
  });
}

function requestHumanActionAndWait(task) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let taskPushed = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try { ws.close(); } catch { }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "validation_request_human_action", payload: { task } }));
      console.error("[mcp-server] validation_request_human_action: task pushed, waiting for human completion...");
      console.error("[mcp-server] task:", JSON.stringify(task, null, 2));

      timer = setTimeout(() => {
        console.error("[mcp-server] timeout waiting for human completion");
        cleanup();
        resolve({
          status: "timeout",
          message: `Timed out after ${HUMAN_ACTION_TIMEOUT_MS / 1000}s waiting for human action`,
          task_id: task.task_id,
        });
      }, HUMAN_ACTION_TIMEOUT_MS);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "validation_request_human_action_result" && !taskPushed) {
          taskPushed = true;
          console.error("[mcp-server] bridge acknowledged task push:", data.ok);
        }

        if (data.type === "validation_request_human_action" && data.payload?.task?.task_id === task.task_id && taskPushed) {
          console.error("[mcp-server] received broadcast echo, ignoring");
          return;
        }

        if (data.type === "validation_human_completed" && data.payload?.taskId === task.task_id) {
          console.error("[mcp-server] human completed signal received:", JSON.stringify(data.payload));
          if (timer) clearTimeout(timer);

          ws.send(JSON.stringify({
            type: "validation_collect_trace_bundle",
            payload: { taskId: task.task_id }
          }));
          console.error("[mcp-server] collecting trace bundle...");
          return;
        }

        if (data.type === "validation_collect_trace_bundle_result" && taskPushed) {
          const bundle = data.bundle || {};
          console.error("[mcp-server] trace bundle collected:", JSON.stringify(bundle, null, 2));
          cleanup();
          resolve({
            status: data.payload?.status || "completed",
            task_id: task.task_id,
            trace_id: task.trace_id,
            bundle,
          });
        }
      } catch (err) {
        // ignore parse errors
      }
    };

    ws.onerror = (err) => {
      console.error("[mcp-server] ws error:", err);
      cleanup();
      reject(err);
    };

    ws.onclose = () => {
      if (timer) {
        clearTimeout(timer);
        reject(new Error("WebSocket closed unexpectedly"));
      }
    };
  });
}

const server = new Server(
  { name: "wujie-bridge-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "validation_request_human_action",
        description:
          "Push a human verification task to the Wujie Chrome Extension Side Panel. " +
          "This call BLOCKS until the human completes all steps and clicks 'Verify Complete', " +
          "or suspends the task. Returns the full trace bundle with feedback and console errors. " +
          "Timeout is 5 minutes.",
        inputSchema: {
          type: "object",
          properties: {
            task: {
              type: "object",
              properties: {
                task_id: { type: "string" },
                trace_id: { type: "string" },
                title: { type: "string" },
                steps: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      step_id: { type: "string" },
                      typ: { type: "string" },
                      instruction: { type: "string" },
                      expected: { type: "string" },
                      selector_hint: { type: "string" },
                      target: { type: "string" }
                    },
                    required: ["step_id", "typ", "instruction", "expected"]
                  }
                }
              },
              required: ["task_id", "trace_id", "title", "steps"]
            }
          },
          required: ["task"]
        }
      },
      {
        name: "validation_collect_trace_bundle",
        description: "Collect trace bundle summary containing human feedback and console errors for a given taskId",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string" }
          },
          required: ["taskId"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "validation_request_human_action") {
    try {
      const task = request.params.arguments.task;
      console.error("[mcp-server] validation_request_human_action called");
      const result = await requestHumanActionAndWait(task);
      console.error("[mcp-server] final result:", JSON.stringify(result, null, 2));
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (e) {
      console.error("[mcp-server] error:", e.message);
      return {
        isError: true,
        content: [{ type: "text", text: `Failed: ${e.message}` }]
      };
    }
  }

  if (request.params.name === "validation_collect_trace_bundle") {
    try {
      console.error("[mcp-server] validation_collect_trace_bundle called, taskId:", request.params.arguments.taskId);
      const res = await sendBridgeRequest("validation_collect_trace_bundle", {
        taskId: request.params.arguments.taskId
      });
      const bundle = res.bundle || res;
      console.error("[mcp-server] trace bundle result:", JSON.stringify(bundle, null, 2));
      return {
        content: [{ type: "text", text: JSON.stringify(bundle, null, 2) }]
      };
    } catch (e) {
      console.error("[mcp-server] error:", e.message);
      return {
        isError: true,
        content: [{ type: "text", text: `Failed to connect to bridge WS: ${e.message}` }]
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
