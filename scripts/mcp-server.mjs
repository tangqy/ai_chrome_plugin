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
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error(`Bridge request "${type}" timed out after 10s`));
    }, 10_000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type, payload }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.type === type ||
          (type === "get_console_errors" && data.type === "console_errors") ||
          (type === "validation_collect_trace_bundle" && data.type === "validation_collect_trace_bundle_result") ||
          (type === "log_write" && data.type === "log_write_result") ||
          (type === "log_query" && data.type === "log_query_result")
        ) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          ws.close();
          resolve(data);
        }
      } catch (err) {
        // ignore
      }
    };

    ws.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Bridge WS connection failed for "${type}"`));
    };
  });
}

function requestHumanActionAndWait(task) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let taskPushed = false;
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      try { ws.close(); } catch {}
    };

    const doResolve = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const doReject = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "validation_request_human_action", payload: { task } }));
      console.error("[mcp-server] validation_request_human_action: task pushed, waiting for human completion...");
      console.error("[mcp-server] task:", JSON.stringify(task, null, 2));

      timer = setTimeout(() => {
        console.error("[mcp-server] timeout waiting for human completion");
        doResolve({
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
          return;
        }

        if (data.type === "validation_human_completed" && data.payload?.taskId === task.task_id) {
          console.error("[mcp-server] human completed signal received:", JSON.stringify(data.payload));
          if (timer) { clearTimeout(timer); timer = null; }

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
          doResolve({
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

    ws.onerror = () => {
      console.error("[mcp-server] ws error");
      doReject(new Error("Bridge WS connection failed"));
    };

    ws.onclose = () => {
      doReject(new Error("WebSocket closed unexpectedly"));
    };
  });
}

function generateId() {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
          "or suspends the task. Returns the full trace bundle with feedback, console errors, and log events. " +
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
        description: "Collect trace bundle containing human feedback, console errors, and log events for a given taskId",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string" }
          },
          required: ["taskId"]
        }
      },
      {
        name: "log_write",
        description:
          "Write a structured AI trace log to the Bridge SQLite database. " +
          "Use this to record what the AI is doing, decisions made, or code changes applied. " +
          "These logs are automatically included in trace bundles for verification. " +
          "Equivalent to @wujie/logger-ts aiTrace().",
        inputSchema: {
          type: "object",
          properties: {
            traceId: { type: "string", description: "Trace ID to group related logs" },
            taskId: { type: "string", description: "Optional task ID to link to a validation task" },
            stepId: { type: "string", description: "Optional step ID within a task" },
            module: { type: "string", description: "Module name (e.g. 'codegen', 'refactor', 'debug')" },
            action: { type: "string", description: "Action being performed (e.g. 'file_written', 'test_run', 'decision')" },
            message: { type: "string", description: "Human-readable description" },
            level: { type: "string", enum: ["debug", "info", "warn", "error"], description: "Log level (default: info)" },
            attrs: { type: "object", description: "Optional structured attributes" }
          },
          required: ["traceId", "module", "action", "message"]
        }
      },
      {
        name: "log_assert",
        description:
          "Write an AI assertion log to the Bridge SQLite database. " +
          "Use this to record expected vs actual outcomes during verification. " +
          "Equivalent to @wujie/logger-ts aiAssert().",
        inputSchema: {
          type: "object",
          properties: {
            traceId: { type: "string", description: "Trace ID" },
            taskId: { type: "string", description: "Optional task ID" },
            stepId: { type: "string", description: "Optional step ID" },
            module: { type: "string", description: "Module name" },
            name: { type: "string", description: "Assertion name (e.g. 'page_loaded', 'button_visible')" },
            passed: { type: "boolean", description: "Whether the assertion passed" },
            expected: { description: "Expected value" },
            actual: { description: "Actual value" }
          },
          required: ["traceId", "module", "name", "passed"]
        }
      },
      {
        name: "log_query",
        description:
          "Query structured log events from the Bridge SQLite database. " +
          "Filter by taskId, traceId, or level. Returns recent matching logs.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Filter by task ID" },
            traceId: { type: "string", description: "Filter by trace ID" },
            level: { type: "string", enum: ["debug", "info", "warn", "error"], description: "Filter by log level" },
            limit: { type: "number", description: "Max results (default 50, max 200)" }
          }
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

  if (request.params.name === "log_write") {
    try {
      const args = request.params.arguments;
      const event = {
        id: generateId(),
        traceId: args.traceId,
        taskId: args.taskId || undefined,
        stepId: args.stepId || undefined,
        source: "ai",
        module: args.module,
        kind: "ai_trace",
        level: args.level || "info",
        action: args.action,
        message: args.message,
        ts: Date.now(),
        attrs: args.attrs || undefined,
      };
      console.error("[mcp-server] log_write:", JSON.stringify(event));
      const res = await sendBridgeRequest("log_write", { event });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: res.ok ?? true, id: event.id }, null, 2) }]
      };
    } catch (e) {
      console.error("[mcp-server] log_write error:", e.message);
      return {
        isError: true,
        content: [{ type: "text", text: `Failed: ${e.message}` }]
      };
    }
  }

  if (request.params.name === "log_assert") {
    try {
      const args = request.params.arguments;
      const event = {
        id: generateId(),
        traceId: args.traceId,
        taskId: args.taskId || undefined,
        stepId: args.stepId || undefined,
        source: "ai",
        module: args.module,
        kind: "ai_assert",
        level: args.passed ? "info" : "error",
        action: `assert:${args.name}`,
        message: `${args.passed ? "PASSED" : "FAILED"}: ${args.name}`,
        ts: Date.now(),
        attrs: {
          assertName: args.name,
          passed: args.passed,
          ...(args.expected !== undefined && { expected: args.expected }),
          ...(args.actual !== undefined && { actual: args.actual }),
        },
      };
      console.error("[mcp-server] log_assert:", JSON.stringify(event));
      const res = await sendBridgeRequest("log_write", { event });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: res.ok ?? true, id: event.id, passed: args.passed }, null, 2) }]
      };
    } catch (e) {
      console.error("[mcp-server] log_assert error:", e.message);
      return {
        isError: true,
        content: [{ type: "text", text: `Failed: ${e.message}` }]
      };
    }
  }

  if (request.params.name === "log_query") {
    try {
      const args = request.params.arguments;
      console.error("[mcp-server] log_query:", JSON.stringify(args));
      const res = await sendBridgeRequest("log_query", {
        taskId: args.taskId,
        traceId: args.traceId,
        level: args.level,
        limit: args.limit || 50,
      });
      const events = res.events || [];
      console.error("[mcp-server] log_query result:", events.length, "events");
      return {
        content: [{ type: "text", text: JSON.stringify({ count: events.length, events }, null, 2) }]
      };
    } catch (e) {
      console.error("[mcp-server] log_query error:", e.message);
      return {
        isError: true,
        content: [{ type: "text", text: `Failed: ${e.message}` }]
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
