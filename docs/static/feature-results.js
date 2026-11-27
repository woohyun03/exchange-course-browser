"use strict";

(() => {
  const form = document.querySelector("form[data-feature]");
  const target = document.getElementById("feature-result") ?? document.getElementById("preview-result");
  const number = Number(form?.dataset.feature);
  const days = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function scheduleList(rows, selected) {
    const schedule = element("div", "schedule-list");
    const sortDays = [...new Set(rows.map(row => row.day))];
    sortDays.sort((a, b) => Object.keys(days).indexOf(a) - Object.keys(days).indexOf(b));
    for (const day of sortDays) {
      const list = element("ul");
      if (!selected) schedule.append(element("h3", "schedule-day", days[day] ?? day));
      for (const row of rows.filter(item => item.day === day)) {
        const item = element("li", "schedule-row");
        const name = row.conflictingCourse ?? row.courseName;
        const time = `${row.startTime}–${row.endTime}`;
        const info = selected ? time : `${time} · ${row.term} · ${row.credits} credits`;
        item.append(element("strong", "", name), element("span", "subtle", info));
        if (selected) {
          const start = row.startTime > selected.start ? row.startTime : selected.start;
          const end = row.endTime < selected.end ? row.endTime : selected.end;
          item.append(element("span", "overlap-time", `Overlaps ${start}–${end}`));
        }
        list.append(item);
      }
      schedule.append(list);
    }
    return schedule;
  }

  function resultTable(columns, rows, labels) {
    const hidden = new Set((target.dataset.hiddenColumns ?? "").split(","));
    if (number === 8) {
      hidden.add("gradedStudents");
      hidden.add("failedStudents");
    }
    const visible = columns.filter(key => !hidden.has(key));
    const wrapper = element("div", "table-wrap");
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", "Query results table");
    const table = element("table", "data");
    table.setAttribute("role", "table");
    const head = table.createTHead();
    head.setAttribute("role", "rowgroup");
    const header = head.insertRow();
    header.setAttribute("role", "row");
    const columnName = key => labels[key] ?? key[0].toUpperCase() + key.slice(1);
    for (const key of visible) {
      const cell = element("th", "", columnName(key));
      cell.setAttribute("role", "columnheader");
      cell.scope = "col";
      header.append(cell);
    }
    const body = table.createTBody();
    body.setAttribute("role", "rowgroup");
    for (const values of rows) {
      const row = body.insertRow();
      row.setAttribute("role", "row");
      for (const key of visible) {
        const value = values[key];
        const cell = element("td", value === null ? "null" : "", value ?? "NULL");
        if (key === "failRatePct" && "gradedStudents" in values && "failedStudents" in values) {
          cell.textContent = `${value}%`;
          cell.append(element("span", "metric-note", `${values.failedStudents} of ${values.gradedStudents} graded enrollments`));
        }
        cell.setAttribute("role", "cell");
        cell.dataset.label = columnName(key);
        row.append(cell);
      }
    }
    wrapper.append(table);
    return wrapper;
  }

  function showSelectedOffering() {
    const option = form.elements.namedItem("offering_id")?.selectedOptions[0];
    if (!option?.value || !option.dataset.course) return null;
    const selected = option.dataset;
    const panel = document.querySelector("[data-selected-offering]");
    panel.replaceChildren(
      element("span", "caption", "Selected class"),
      element("strong", "", selected.course),
      element("p", "subtle", `${days[selected.day] ?? selected.day}, ${selected.start}–${selected.end}`),
    );
    panel.hidden = false;
    const filters = document.querySelector("[data-offering-filter]");
    filters.open = false;
    filters.querySelector("summary").textContent = "Change class";
    return selected;
  }

  window.renderFeatureResults = function (columns, values, labels, more) {
    const selected = number === 11 ? showSelectedOffering() : null;
    const rows = values.map(row => Object.fromEntries(columns.map((key, i) => [key, row[i]])));
    const section = element("section", "block flat");
    section.setAttribute("aria-labelledby", "results-heading");
    const heading = element("div", "result-head");
    const title = element("h2", "", number === 11 ? "Overlapping classes" : "Results");
    title.id = "results-heading";
    const count = element("span", "count",
      `${more ? "First " : ""}${rows.length} ${rows.length === 1 ? "result" : "results"}`);
    heading.append(title, count);
    section.append(heading);
    if (number === 3) {
      const time = form.elements.namedItem("earliest_start").value;
      section.append(element("p", "result-scope", `Mon–Wed · Starts at ${time} or later`));
    }
    if (number === 5 || number === 9) {
      section.append(element("p", "result-scope", "All semesters"));
    }
    if (rows.length === 0) {
      section.append(element("p", "empty", target.dataset.emptyMessage));
    } else {
      section.append(number === 3 || selected ? scheduleList(rows, selected) : resultTable(columns, rows, labels));
    }
    target.replaceChildren(section);
  };

  const server = document.getElementById("server-feature-results");
  if (server) {
    const {run, labels} = JSON.parse(server.textContent);
    window.renderFeatureResults(run.columns, run.rows, labels, run.more);
  }
})();
