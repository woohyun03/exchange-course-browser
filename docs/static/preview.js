"use strict";

const root = new URL("../", document.currentScript.src);
const form = document.querySelector("form[data-feature]");
const results = document.getElementById("preview-result");
const params = new URLSearchParams(window.location.search);

function message(text) {
  results.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.className = "block";
  paragraph.textContent = text;
  results.append(paragraph);
}

async function fetchAsset(path) {
  const response = await fetch(new URL(path, root), { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }
  return response;
}

let previewAssets;
function loadAssets() {
  previewAssets ??= Promise.all([
    initSqlJs({ locateFile: (filename) => new URL(`static/${filename}`, root).href }),
    fetchAsset("static/features.json").then(response => response.json()),
    fetchAsset("app.db").then(response => response.arrayBuffer()),
  ]).catch(error => {
    previewAssets = null;
    throw error;
  });
  return previewAssets;
}

window.loadPreviewPlanCatalogue = async function (destination) {
  const [SQL, config, data] = await loadAssets();
  const database = new SQL.Database(new Uint8Array(data));
  try {
    database.run("PRAGMA query_only = ON");
    const statement = database.prepare(config.courseDetails.plan_catalogue);
    try {
      statement.bind({ ":destination": Number(destination) });
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  } finally {
    database.close();
  }
};

async function displayResults() {
  const fields = [...form.querySelectorAll("[name]:not([data-plan-context])")];
  const number = Number(form.dataset.feature);
  const planReady = Boolean(form.querySelector("[data-plan-context]"));
  const readyWithPlan = planReady && form.hasAttribute("data-run-with-plan") &&
    fields.every((field) => !field.required || field.value);
  if (!fields.some((field) => params.has(field.name)) && !readyWithPlan) return;

  const bindings = {};
  for (const field of fields) {
    if (params.has(field.name)) field.value = params.get(field.name);
    const raw = field.value.trim();
    const disabledOption = field instanceof HTMLSelectElement && field.selectedOptions[0]?.disabled;
    if (!field.checkValidity() || disabledOption || (field.required && field.value === "")) {
      message("Check your inputs and run the search again.");
      return;
    }
    const numeric = field.type === "number" || (field.tagName === "SELECT" && /^\d+$/.test(raw));
    bindings[`:${field.name}`] = numeric ? Number(raw) : raw || null;
  }

  message("Loading results…");
  const [SQL, config, data] = await loadAssets();
  const database = new SQL.Database(new Uint8Array(data));
  let keepDatabase = false;
  try {
    database.run("PRAGMA query_only = ON");
    const query = config.queries[number - 1];
    const statement = database.prepare(query);
    try {
      statement.bind(bindings);
      const columns = statement.getColumnNames();
      const rows = [];
      while (rows.length <= config.limit && statement.step()) rows.push(statement.get());
      if (window.renderCourseResults) {
        window.renderCourseResults(columns, rows.slice(0, config.limit), rows.length > config.limit,
          (kind, course, term) => {
            const params = kind === "times" ? { ":course_id": course, ":term": term } : { ":course_id": course };
            const detail = database.prepare(config.courseDetails[kind]);
            try {
              detail.bind(params);
              const records = [];
              while (detail.step()) records.push(detail.getAsObject());
              return records;
            } finally {
              detail.free();
            }
          });
        keepDatabase = true;
        results.replaceChildren();
      } else {
        window.renderFeatureResults(columns, rows.slice(0, config.limit), config.columnLabels, rows.length > config.limit);
      }
    } finally {
      statement.free();
    }
  } finally {
    if (!keepDatabase) database.close();
  }
}

if (form) {
  displayResults().catch((error) => {
    console.error(error);
    message("Could not load the results. Refresh and try again.");
  });
}
