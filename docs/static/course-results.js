"use strict";

(() => {
  const results = document.getElementById("course-results");
  const template = document.getElementById("course-result-row");
  const params = new URLSearchParams(window.location.search);
  const form = document.querySelector("form[data-feature]");
  const days = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };

  function addDetail(content, kind, records, course, semester) {
    content.replaceChildren();
    if (records.length === 0) {
      content.textContent = kind === "equivalent" ? "No HKU equivalent recorded." : "No class times found for this semester.";
      return;
    }

    const list = document.createElement("ul");
    list.className = "detail-list";
    for (const record of records) {
      const item = document.createElement("li");
      if (kind === "equivalent") {
        item.textContent = `${record.equivalent} · ${record.credits} HKU credits`;
      } else {
        const label = semester ? "" : record.term.replace("Sem ", "Semester ") + " · ";
        item.textContent = label + `${days[record.day] ?? record.day}, ${record.startTime}–${record.endTime}`;
        const clash = document.createElement("a");
        const url = new URL(results.dataset.clashesUrl, window.location.href);
        url.searchParams.set("offering_id", record.offeringID);
        const campusField = form.elements.namedItem("uni_id");
        const campus = [...(campusField?.options ?? [])].find(option => option.textContent.trim() === course.university);
        if (campus?.value) {
          url.searchParams.set("destination", campus.value);
          url.searchParams.set("semester", record.term);
        }
        clash.href = url.href;
        clash.textContent = "Check clashes";
        item.append(clash);
      }
      list.append(item);
    }
    content.append(list);
  }

  window.renderCourseResults = function (columns, rows, more, runDetail) {
    const count = document.createElement("p");
    count.className = "results-count";
    count.textContent = `${more ? "First " : ""}${rows.length} ${rows.length === 1 ? "course" : "courses"}`;
    results.replaceChildren(count);
    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-message";
      empty.textContent = "No courses match these filters.";
      results.append(empty);
      return;
    }

    const semester = form.elements.namedItem("term")?.value || null;
    for (const values of rows) {
      const course = Object.fromEntries(columns.map((column, i) => [column, values[i]]));
      const row = template.content.cloneNode(true);
      row.querySelector("h2").textContent = course.courseName;
      const meta = [course.department, `${course.credits} credits`];
      if (!params.has("destination") || params.get("destination") !== form.elements.namedItem("uni_id")?.value) meta.unshift(course.university);
      row.querySelector(".course-meta").textContent = meta.join(" · ");
      const badge = row.querySelector(".exam-status");
      badge.textContent = course.hasExam === "Yes" ? "Final exam" : "No final exam";
      badge.dataset.noExam = String(course.hasExam === "No");
      const detail = row.querySelector(".course-detail");
      const content = detail.querySelector(".detail-content");
      const actions = [...row.querySelectorAll("[data-detail]")];
      let sequence = 0;

      for (const action of actions) {
        action.addEventListener("click", async () => {
          const current = ++sequence;
          const expand = action.getAttribute("aria-expanded") !== "true";
          for (const other of actions) other.setAttribute("aria-expanded", String(other === action && expand));
          detail.hidden = !expand;
          if (!expand) return;

          const kind = action.dataset.detail;
          detail.querySelector(".caption").textContent = kind === "equivalent"
            ? "HKU equivalent" : (semester?.replace("Sem ", "Semester ") ?? "Class times");
          content.textContent = "Loading…";
          try {
            const records = await runDetail(kind, course.courseID, semester);
            if (current === sequence) addDetail(content, kind, records, course, semester);
          } catch {
            if (current === sequence) content.textContent = "Could not load details. Close and try again.";
          }
        });
      }
      results.append(row);
    }
  };

  const serverResults = document.getElementById("server-course-results");
  if (serverResults) {
    const { columns, rows, more } = JSON.parse(serverResults.textContent);
    window.renderCourseResults(columns, rows, more, async (kind, course, term) => {
      const url = new URL(results.dataset.detailsUrl, window.location.href);
      url.searchParams.set("kind", kind);
      url.searchParams.set("course_id", course);
      if (term) url.searchParams.set("term", term);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Course details unavailable");
      return response.json();
    });
  }
})();
