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

function addCell(row, tag, text) {
  const cell = document.createElement(tag);
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function showTable(columns, rows, labels, limit) {
  const section = document.createElement("section");
  section.className = "block flat";
  section.setAttribute("aria-labelledby", "results-heading");

  const heading = document.createElement("div");
  heading.className = "result-head";
  const title = document.createElement("h2");
  title.id = "results-heading";
  title.textContent = "Results";
  const count = document.createElement("span");
  count.className = "count";
  count.textContent = rows.length > limit
    ? `First ${limit} results`
    : `${rows.length} ${rows.length === 1 ? "result" : "results"}`;
  heading.append(title, count);
  section.append(heading);

  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No results match these filters.";
    section.append(empty);
  } else {
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrap";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", "Query results table");
    const table = document.createElement("table");
    table.className = "data";
    const header = table.createTHead().insertRow();
    for (const column of columns) {
      addCell(header, "th", labels[column] ?? column[0].toUpperCase() + column.slice(1)).scope = "col";
    }
    const body = table.createTBody();
    for (const values of rows.slice(0, limit)) {
      const row = body.insertRow();
      for (const value of values) {
        const cell = addCell(row, "td", value === null ? "NULL" : String(value));
        if (value === null) cell.className = "null";
      }
    }
    wrapper.append(table);
    section.append(wrapper);
  }

  results.replaceChildren(section);
}

async function displayResults() {
  const fields = [...form.querySelectorAll("[name]:not([data-plan-context])")];
  const number = Number(form.dataset.feature);
  const planReady = Boolean(form.querySelector("[data-plan-context]"));
  if (!fields.some((field) => params.has(field.name)) &&
      !(planReady && (number === 1 || number === 4))) return;

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
  const [SQL, config, data] = await Promise.all([
    initSqlJs({ locateFile: (filename) => new URL(`static/${filename}`, root).href }),
    fetchAsset("static/features.json").then((response) => response.json()),
    fetchAsset("app.db").then((response) => response.arrayBuffer()),
  ]);
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
        showTable(columns, rows, config.columnLabels, config.limit);
      }
    } finally {
      statement.free();
    }
  } finally {
    if (!keepDatabase) database.close();
  }
}

displayResults().catch((error) => {
  console.error(error);
  message("Could not load the results. Refresh and try again.");
});
