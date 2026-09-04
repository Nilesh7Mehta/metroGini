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
        "  const data = json.data || json;",
        "  const id = json.id || json.order_id || data.order_id || data.id;",
        "  if (id && !data.address_id) pm.collectionVariables.set('orderId', String(id));",
        "  if (data.address_id) pm.collectionVariables.set('addressId', String(data.address_id));",
        "}",
      ],
    },
  },
];

/** Pull first "Required:" / "Optional:" lines from catalog text. */
const extractFieldLine = (text, label) => {
  if (!text) return null;
  const re = new RegExp(`${label}:\\s*([^\\n]+)`, "i");
  const m = String(text).match(re);
  return m ? m[1].trim() : null;
};

const firstFieldKeys = (line) => {
  if (!line || /^none$/i.test(line.trim())) return [];
  return line
    .split(",")
    .map((part) => {
      const token = part.trim().split(/\s+/)[0] || "";
      return token.replace(/[^a-zA-Z0-9_]/g, "");
    })
    .filter(Boolean);
};

const buildFieldGuide = (row) => {
  const blob = [row.descriptionExtra, row.request].filter(Boolean).join("\n");
  const required =
    row.requiredFields ||
    extractFieldLine(blob, "Required") ||
    extractFieldLine(blob, "Query required") ||
    extractFieldLine(blob, "Path required") ||
    (row.body ? "see body keys below" : "none (no body)");
  const optional =
    row.optionalFields ||
    extractFieldLine(blob, "Optional") ||
    "none";

  const lines = [
    "========== FIELD GUIDE ==========",
    `REQUIRED: ${required}`,
    `OPTIONAL: ${optional}`,
    "=================================",
    "",
    "How to use in Postman:",
    "- OPTIONAL query params are unchecked (disabled). Tick only if needed.",
    "- Body tab sends clean JSON (no comments).",
    "- Annotated body below is documentation for Gallabox (which fields are optional).",
  ];

  if (row.query?.length) {
    lines.push("", "Query params:");
    for (const q of row.query) {
      const tag = q.disabled ? "OPTIONAL" : "REQUIRED (or usually sent)";
      const note = q.description ? ` — ${q.description}` : "";
      lines.push(`  • ${q.key}: ${tag}${note}`);
    }
  }

  if (row.body && typeof row.body === "object" && !Array.isArray(row.body)) {
    const optKeys = new Set(firstFieldKeys(optional));
    const reqKeys = new Set(firstFieldKeys(required));
    lines.push("", "Annotated body (docs only — do not paste comments into Body):");
    lines.push("{");
    const keys = Object.keys(row.body);
    keys.forEach((key, i) => {
      const val = JSON.stringify(row.body[key]);
      let tag = "INCLUDED";
      if (optKeys.has(key)) tag = "OPTIONAL — can omit";
      else if (reqKeys.has(key) || reqKeys.size === 0) tag = "REQUIRED";
      const comma = i < keys.length - 1 ? "," : "";
      lines.push(`  "${key}": ${val}${comma}  // ${tag}`);
    });
    lines.push("}");
  }

  return lines.join("\n");
};

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
          buildFieldGuide(row) +
          "\n\n" +
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
  const query = (row.query || []).map((q) => {
    const isOpt = Boolean(q.disabled);
    const base = q.description || "";
    const prefix = isOpt
      ? "OPTIONAL — leave unchecked if not needed"
      : "REQUIRED / usually sent";
    return {
      key: q.key,
      value: q.value,
      description: base ? `${prefix}. ${base}` : prefix,
      disabled: isOpt,
    };
  });

  const headers = [];
  if (row.postmanAuth === "whatsapp") {
    headers.push({
      key: "X-Gallabox-Secret",
      value: "{{whatsappSecret}}",
      type: "text",
    });
  }
  headers.push({ key: "Content-Type", value: "application/json", type: "text" });

  const descParts = [
    buildFieldGuide(row),
    row.descriptionExtra,
    row.request,
    `Token: ${row.token}`,
  ];

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
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(
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
      "Generated from Whatsapp scenarios -updated.docx (11 scenarios only).\n\n" +
      "Folder names match the updated document.\n" +
      "Every request Description starts with FIELD GUIDE (REQUIRED / OPTIONAL).\n" +
      "Body requests also show an annotated body with // OPTIONAL comments (docs only).\n" +
      "Body tab still sends clean JSON so Send works.\n" +
      "Optional query params are unchecked (disabled) in Postman.\n" +
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

const toExcelRow = (r) => ({
  Scenario: r.scenario,
  Name: r.name,
  Endpoint: r.method === "—" ? r.path : `${r.method} ${BASE}${r.path}`,
  Request: [buildFieldGuide(r), r.descriptionExtra, r.request]
    .filter(Boolean)
    .join("\n\n"),
  Response:
    typeof r.response === "string" ? r.response : JSON.stringify(r.response, null, 2),
  Token: r.token,
});

const excelHeaders = ["Scenario", "Name", "Endpoint", "Request", "Response", "Token"];
const excelCols = [
  { wch: 58 },
  { wch: 42 },
  { wch: 72 },
  { wch: 64 },
  { wch: 64 },
  { wch: 28 },
];

const makeSheet = (rows) => {
  const ws = XLSX.utils.json_to_sheet(rows, { header: excelHeaders });
  ws["!cols"] = excelCols;
  return ws;
};

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  makeSheet(CATALOG.filter((r) => r.scenario === SCENARIO_NAMES.shared).map(toExcelRow)),
  "Shared",
);
for (let n = 1; n <= 11; n++) {
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(CATALOG.filter((r) => r.scenario === SCENARIO_NAMES[n]).map(toExcelRow)),
    `Scenario ${n}`,
  );
}

const excelPath = join(__dirname, "..", "gallabox_scenarios.xlsx");
try {
  XLSX.writeFile(wb, excelPath);
  console.log("Excel (12 sheets: Shared + Scenario 1–11):", excelPath);
} catch (err) {
  if (err.code === "EBUSY") {
    const alt = join(__dirname, "..", "gallabox_scenarios_updated.xlsx");
    XLSX.writeFile(wb, alt);
    console.log("Excel was open. Wrote 12 sheets to:", alt);
    process.exit(0);
  }
  throw err;
}
