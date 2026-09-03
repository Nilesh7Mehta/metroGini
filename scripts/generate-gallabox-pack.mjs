import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { BASE, CATALOG, SCENARIO_NAMES } from "./gallabox-catalog.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const saveTokenEvents = [
  {
    listen: "test",
    script: {
      type: "text/javascript",
      exec: [
        "if (pm.response.code >= 200 && pm.response.code < 300) {",
        "  const json = pm.response.json();",
        "  const data = json.data || json;",
        "  if (data.access_token) pm.collectionVariables.set('token', data.access_token);",
        "  if (data.refresh_token) pm.collectionVariables.set('refreshToken', data.refresh_token);",
        "  if (data.user_id) pm.collectionVariables.set('userId', String(data.user_id));",
        "  if (data.active_order_id) pm.collectionVariables.set('orderId', String(data.active_order_id));",
        "  if (data.draft_order_id) pm.collectionVariables.set('draftOrderId', String(data.draft_order_id));",
        "}",
      ],
    },
  },
];

const saveOrderEvents = [
  {
    listen: "test",
    script: {
      type: "text/javascript",
      exec: [
        "if (pm.response.code >= 200 && pm.response.code < 300) {",
        "  const json = pm.response.json();",
        "  const id = json.id || json.order_id || (json.data && (json.data.order_id || json.data.id));",
        "  if (id) pm.collectionVariables.set('orderId', String(id));",
        "  if (json.data && json.data.address_id) pm.collectionVariables.set('addressId', String(json.data.address_id));",
        "}",
      ],
    },
  },
];

const toPostmanItem = (row) => {
  if (row.postmanAuth === "skip") {
    return {
      name: row.name,
      request: {
        method: "GET",
        header: [],
        url: {
          raw: "{{baseUrl}}",
          host: ["{{baseUrl}}"],
        },
        description:
          (row.request || "") +
          "\n\nNo MetroGini API — Gallabox menu only.",
      },
      response: [],
    };
  }

  let path = row.path.replace("/api/", "").replace(/^\//, "");
  const orderVar = row.useDraftId ? "{{draftOrderId}}" : "{{orderId}}";
  path = path
    .replace(":id", orderVar)
    .replace(":order_id", orderVar)
    .replace(":mobile", "{{mobile}}");

  if (row.pathVars?.id) {
    path = path.replace(orderVar, row.pathVars.id).replace(":id", row.pathVars.id);
    if (row.path.includes("address/default")) {
      path = `user/address/default/${row.pathVars.id}`;
    }
  }

  const pathParts = path.split("/").filter(Boolean);
  const query = (row.query || []).map((q) => ({
    key: q.key,
    value: q.value,
    description: q.description || "",
    disabled: Boolean(q.disabled),
  }));

  const headers = [];
  if (row.postmanAuth === "whatsapp") {
    headers.push({
      key: "X-Gallabox-Secret",
      value: "{{whatsappSecret}}",
      type: "text",
    });
  }
  headers.push({ key: "Content-Type", value: "application/json", type: "text" });

  const descParts = [];
  if (row.descriptionExtra) descParts.push(row.descriptionExtra);
  descParts.push(row.request || "");
  descParts.push(`Token: ${row.token}`);

  const item = {
    name: row.name,
    request: {
      method: row.method === "—" ? "GET" : row.method,
      header: headers,
      url: {
        raw:
          `{{baseUrl}}api/${path}` +
          (query.length
            ? `?${query
                .filter((q) => !q.disabled)
                .map((q) => `${q.key}=${q.value}`)
                .join("&")}`
            : ""),
        host: ["{{baseUrl}}api"],
        path: pathParts,
        ...(query.length ? { query } : {}),
      },
      description: descParts.filter(Boolean).join("\n\n"),
    },
    response: [],
  };

  if (row.postmanAuth === "user") {
    item.request.auth = {
      type: "bearer",
      bearer: [{ key: "token", value: "{{token}}", type: "string" }],
    };
  }
  if (row.postmanAuth === "vendor") {
    item.request.auth = {
      type: "bearer",
      bearer: [{ key: "token", value: "{{vendorToken}}", type: "string" }],
    };
  }

  if (row.body && !row.skipBodyJson) {
    item.request.body = {
      mode: "raw",
      raw: JSON.stringify(row.body, null, 2),
      options: { raw: { language: "json" } },
    };
  }

  const events = [];
  if (row.saveToken) events.push(...saveTokenEvents);
  if (row.saveOrder) events.push(...saveOrderEvents);
  if (events.length) item.event = events;

  return item;
};

const folderOrder = [
  SCENARIO_NAMES.shared,
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(
    (n) => SCENARIO_NAMES[n],
  ),
];

const items = folderOrder.map((name) => ({
  name,
  item: CATALOG.filter((r) => r.scenario === name).map(toPostmanItem),
}));

const collection = {
  info: {
    _postman_id: "gallabox-whatsapp-from-txt-001",
    name: "Gallabox WhatsApp Scenarios",
    description:
      "Generated from gallabox_whatsapp_scenario_apis.txt\n\n" +
      "Folder names match the txt file.\n" +
      "Optional query params are unchecked (disabled) in Postman.\n" +
      "Optional body fields are listed in each request Description.\n" +
      "Easy auth: POST /api/whatsapp/session with X-Gallabox-Secret → {{token}}.\n" +
      "Set vars: baseUrl, whatsappSecret, mobile, pincode, groupCode.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "baseUrl", value: "https://api.metrogini.com/" },
    { key: "whatsappSecret", value: "change-me-gallabox-secret" },
    { key: "token", value: "" },
    { key: "vendorToken", value: "" },
    { key: "refreshToken", value: "" },
    { key: "mobile", value: "9004186460" },
    { key: "pincode", value: "400058" },
    { key: "groupCode", value: "MUM_WEST" },
    { key: "orderId", value: "1" },
    { key: "draftOrderId", value: "1" },
    { key: "addressId", value: "1" },
    { key: "userId", value: "1" },
  ],
  item: items,
};

const postmanPath = join(
  __dirname,
  "..",
  "Gallabox_WhatsApp_Scenarios.postman_collection.json",
);
writeFileSync(postmanPath, JSON.stringify(collection, null, 2));
console.log("Postman:", postmanPath);

const excelRows = CATALOG.map((r) => ({
  Scenario: r.scenario,
  Name: r.name,
  Endpoint: r.method === "—" ? r.path : `${r.method} ${BASE}${r.path}`,
  Request: r.request,
  Response:
    typeof r.response === "string" ? r.response : JSON.stringify(r.response, null, 2),
  Token: r.token,
}));

const ws = XLSX.utils.json_to_sheet(excelRows, {
  header: ["Scenario", "Name", "Endpoint", "Request", "Response", "Token"],
});
ws["!cols"] = [
  { wch: 58 },
  { wch: 42 },
  { wch: 72 },
  { wch: 64 },
  { wch: 64 },
  { wch: 28 },
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "All scenarios");

const excelPath = join(__dirname, "..", "gallabox_scenarios.xlsx");
try {
  XLSX.writeFile(wb, excelPath);
  console.log("Excel (1 sheet):", excelPath, "rows=", excelRows.length);
} catch (err) {
  if (err.code === "EBUSY") {
    console.error("Close gallabox_scenarios.xlsx and run again.");
    process.exit(1);
  }
  throw err;
}
