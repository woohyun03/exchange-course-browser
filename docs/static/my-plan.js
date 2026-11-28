"use strict";

(() => {
  const storageKey = "comp3278-exchange-planner:plans:v1";
  const lastPlanKey = "comp3278-exchange-planner:last-plan";
  const buttons = new Map();
  const catalogues = new Map();
  const params = new URLSearchParams(window.location.search);
  const choices = JSON.parse(document.getElementById("exchange-choices").textContent);
  const destination = params.get("destination");
  const days = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };

  function loadCatalogue(destination) {
    if (!catalogues.has(destination)) {
      const path = JSON.parse(document.getElementById("plan-catalogue-url").textContent);
      const request = path ? (async () => {
        const url = new URL(path, window.location.href);
        url.searchParams.set("destination", destination);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Course list unavailable");
        return response.json();
      })() : window.loadPreviewPlanCatalogue(destination);
      catalogues.set(destination, request.catch(error => {
        catalogues.delete(destination);
        throw error;
      }));
    }
    return catalogues.get(destination);
  }

  function readPlans() {
    const plans = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return plans && typeof plans === "object" && !Array.isArray(plans) ? plans : {};
  }

  function termPlan(plans, destination, term) {
    const entry = plans[destination]?.[term];
    return {
      target: Number.isInteger(entry?.target) ? entry.target : null,
      courses: Array.isArray(entry?.courses) ? entry.courses : [],
    };
  }

  function chooseOffering(item, options) {
    return options.find(option => option.offeringID === item.offeringID)
      ?? (!item.offeringID && options.length === 1 ? options[0] : undefined);
  }

  function saveTerm(destination, term, update) {
    const plans = readPlans();
    const entry = update(termPlan(plans, destination, term));
    plans[destination] = { ...plans[destination], [term]: entry };
    localStorage.setItem(storageKey, JSON.stringify(plans));
    try {
      localStorage.setItem(lastPlanKey, JSON.stringify({ destination, term }));
    } catch {
      // The plan was saved. The resume shortcut is optional.
    }
    return entry;
  }

  function setButton(button, selected, term) {
    button.textContent = selected ? `Added · ${term.replace("Sem ", "Semester ")}` : "Add to My Plan";
    button.setAttribute("aria-pressed", String(selected));
  }

  function refreshButtons() {
    let plans;
    try {
      plans = readPlans();
    } catch {
      return;
    }
    for (const [button, { destination, term, id }] of buttons) {
      if (!button.isConnected) {
        buttons.delete(button);
        continue;
      }
      setButton(button, termPlan(plans, destination, term).courses.some(course => course.id === id), term);
    }
    const count = document.querySelector("[data-plan-count]");
    if (count) {
      const size = choices.semesters.reduce((sum, term) => sum + termPlan(plans, destination, term).courses.length, 0);
      count.textContent = String(size);
      count.hidden = size === 0;
    }
    const resume = document.querySelector("[data-resume-plan]");
    if (resume) {
      try {
        const last = JSON.parse(localStorage.getItem(lastPlanKey));
        const available = choices.destinations.flatMap(([id]) => choices.semesters
          .map(term => ({ destination: String(id), term }))
          .filter(({ destination, term }) => {
            const entry = termPlan(plans, destination, term);
            return entry.courses.length || entry.target != null;
          }));
        const recent = available.find(scope => scope.destination === last?.destination && scope.term === last?.term)
          ?? available.find(scope => scope.destination === last?.destination)
          ?? available[0];
        if (!recent) {
          resume.hidden = true;
          return;
        }
        const url = new URL(resume.href);
        url.searchParams.set("destination", recent.destination);
        url.searchParams.set("semester", recent.term);
        resume.href = url;
        resume.hidden = false;
      } catch {
        resume.hidden = true;
      }
    }
  }

  window.exchangePlan = {
    loadCatalogue,
    savedOfferings(destination, term, catalogue) {
      try {
        const courses = termPlan(readPlans(), destination, term).courses;
        const offerings = courses.map(course => chooseOffering(course,
          catalogue.filter(row => row.courseID === course.id && row.term === term)));
        return new Set(offerings.filter(Boolean).map(row => row.offeringID));
      } catch {
        return new Set();
      }
    },
    bindCourse(button, destination, term, course, onChange) {
      const item = { id: course.courseID, name: course.courseName, credits: course.credits };
      if (course.offeringID) item.offeringID = course.offeringID;
      try {
        const entry = termPlan(readPlans(), destination, term);
        setButton(button, entry.courses.some(saved => saved.id === item.id), term);
      } catch {
        return;
      }
      button.hidden = false;
      button.title = `Toggle ${item.name} in My Plan for ${term.replace("Sem ", "Semester ")}`;
      buttons.set(button, { destination, term, id: item.id });
      button.addEventListener("click", () => {
        try {
          const saved = saveTerm(destination, term, entry => {
            const exists = entry.courses.some(course => course.id === item.id);
            entry.courses = exists ? entry.courses.filter(course => course.id !== item.id)
              : [...entry.courses, item];
            return entry;
          });
          refreshButtons();
          onChange?.(saved);
        } catch {
          button.textContent = "Could not save in this browser";
        }
      });
    },
  };

  window.addEventListener("pageshow", refreshButtons);
  window.addEventListener("storage", refreshButtons);
  refreshButtons();

  const page = document.querySelector("[data-personal-plan]");
  if (!page || !choices.destinations.some(([id]) => String(id) === destination) ||
      !choices.semesters.includes(params.get("semester"))) return;

  document.querySelector("[data-plan-setup]").hidden = true;
  page.hidden = false;

  const switches = [...page.querySelectorAll("[data-term-switch]")];
  const panels = [...page.querySelectorAll("[data-term]")];
  function showTerm(term) {
    for (const button of switches) button.setAttribute("aria-pressed", String(button.dataset.termSwitch === term));
    for (const panel of panels) panel.hidden = panel.dataset.term !== term;
  }
  for (const button of switches) button.addEventListener("click", () => showTerm(button.dataset.termSwitch));
  showTerm(params.get("semester"));

  const renderers = [];
  let catalogue;
  let catalogueFailed = false;
  const classTime = row => `${days[row.day] ?? row.day}, ${row.startTime}–${row.endTime}`;
  for (const panel of panels) {
    const term = panel.dataset.term;
    const summary = switches.find(button => button.dataset.termSwitch === term).querySelector("[data-term-summary]");
    const schedule = panel.querySelector("[data-plan-schedule]");
    const field = panel.querySelector("[data-credit-target]");
    const total = panel.querySelector("[data-credit-total]");
    const status = panel.querySelector("[data-credit-status]");
    const list = panel.querySelector("[data-planned-courses]");
    const picker = panel.querySelector(".plan-course-picker");
    const search = picker.querySelector('input[type="search"]');
    const searchStatus = picker.querySelector("[data-search-status]");
    const matches = picker.querySelector("[data-course-matches]");
    let available;
    let loading = false;

    function showMatches() {
      matches.replaceChildren();
      if (!available) return;
      const keyword = search.value.trim().toLowerCase();
      const results = available.filter(course => course.courseName.toLowerCase().includes(keyword));
      searchStatus.textContent = results.length === 0 ? "No matching courses in this semester."
        : results.length > 8 ? `Showing 8 of ${results.length} courses. Search to narrow the list.` : "";
      for (const course of results.slice(0, 8)) {
        const row = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = `${course.courseName} · ${course.credits} credits`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "save-course";
        button.hidden = true;
        window.exchangePlan.bindCourse(button, destination, term, course, entry => render(entry));
        row.append(label, button);
        matches.append(row);
      }
      refreshButtons();
    }

    picker.addEventListener("toggle", async () => {
      if (!picker.open || loading || available) return;
      loading = true;
      searchStatus.textContent = "Loading courses…";
      try {
        const rows = await loadCatalogue(destination);
        if (catalogueFailed) {
          catalogue = rows;
          catalogueFailed = false;
          refreshPage();
        }
        const unique = new Map();
        for (const course of rows) {
          if (course.term === term && !unique.has(course.courseID)) {
            unique.set(course.courseID, { courseID: course.courseID, courseName: course.courseName, credits: course.credits });
          }
        }
        available = [...unique.values()];
        showMatches();
      } catch {
        searchStatus.textContent = "Could not load courses. Close and reopen to retry.";
      } finally {
        loading = false;
      }
    });
    search.addEventListener("input", showMatches);

    function render(entry, restoreTarget = true) {
      const sum = entry.courses.reduce((value, course) => value + course.credits, 0);
      const remaining = entry.target == null ? null : Math.max(0, entry.target - sum);
      const timesByCourse = new Map();
      const scheduled = [];
      for (const item of entry.courses) {
        const options = catalogue?.filter(row => row.courseID === item.id && row.term === term) ?? [];
        const chosen = chooseOffering(item, options);
        timesByCourse.set(item.id, { options, chosen });
        if (chosen) scheduled.push(chosen);
      }
      const clashes = [];
      for (const [index, first] of scheduled.entries()) {
        for (const second of scheduled.slice(index + 1)) {
          if (first.day !== second.day || first.startTime >= second.endTime || second.startTime >= first.endTime) continue;
          const start = first.startTime > second.startTime ? first.startTime : second.startTime;
          const end = first.endTime < second.endTime ? first.endTime : second.endTime;
          clashes.push(`${first.courseName} and ${second.courseName} · ${days[first.day] ?? first.day} ${start}–${end}`);
        }
      }
      const pending = entry.courses.length - scheduled.length;
      const clashCount = `${clashes.length} ${clashes.length === 1 ? "clash" : "clashes"}`;
      const creditSummary = remaining == null ? `${sum} credits`
        : remaining ? `${remaining} credits left` : "Target met";
      summary.textContent = [`${entry.courses.length} ${entry.courses.length === 1 ? "course" : "courses"}`,
        creditSummary, catalogue && entry.courses.length ? (clashes.length ? clashCount
          : pending ? `${pending} times pending` : "No clashes") : ""].filter(Boolean).join(" · ");
      schedule.replaceChildren();
      schedule.hidden = entry.courses.length === 0;
      schedule.dataset.hasClash = String(clashes.length > 0);
      const scheduleTitle = document.createElement("strong");
      scheduleTitle.textContent = catalogueFailed ? "Class times could not be loaded"
        : !catalogue ? "Checking class times…"
        : clashes.length ? `${clashCount} in your plan`
        : pending ? "Choose class times to finish checking"
        : "No timetable clashes";
      schedule.append(scheduleTitle);
      if (clashes.length) {
        const conflicts = document.createElement("ul");
        for (const clash of clashes) {
          const line = document.createElement("li");
          line.textContent = clash;
          conflicts.append(line);
        }
        schedule.append(conflicts);
      }
      if (catalogue && pending && clashes.length) {
        const incomplete = document.createElement("p");
        incomplete.textContent = `${pending} ${pending === 1 ? "course still needs" : "courses still need"} a class time.`;
        schedule.append(incomplete);
      }
      if (restoreTarget) field.value = entry.target ?? "";
      total.textContent = entry.target == null ? `${sum} exchange credits`
        : `${sum} / ${entry.target} exchange credits`;
      status.textContent = entry.target == null ? "Set a target to check your credit load."
        : sum >= entry.target ? "Credit target met."
        : `${entry.target - sum} more ${entry.target - sum === 1 ? "credit" : "credits"} needed.`;
      status.dataset.met = String(entry.target != null && sum >= entry.target);
      list.replaceChildren();
      if (entry.courses.length === 0) {
        const empty = document.createElement("li");
        empty.className = "subtle";
        empty.textContent = "No courses added for this semester.";
        list.append(empty);
        return;
      }
      for (const item of entry.courses) {
        const row = document.createElement("li");
        const label = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = item.name;
        const credits = document.createElement("span");
        credits.className = "subtle";
        credits.textContent = `${item.credits} exchange credits`;
        label.append(name, credits);
        if (catalogue) {
          const { options, chosen } = timesByCourse.get(item.id);
          const hint = document.createElement("span");
          hint.className = "subtle planned-course-note";
          hint.textContent = chosen ? classTime(chosen) : options.length ? "Choose a class time" : "Class time unavailable";
          label.append(hint);
          const recorded = options[0]?.recordedHKUCredits;
          if (options.length) {
            const hku = document.createElement("span");
            hku.className = "subtle planned-course-note";
            hku.textContent = recorded
              ? `Recorded HKU equivalents: ${recorded.split(",").sort((a, b) => Number(a) - Number(b)).join(" or ")} credits`
              : "No HKU equivalent recorded";
            label.append(hku);
          }
          if (options.length > 1 || (options.length && !chosen)) {
            const select = document.createElement("select");
            select.dataset.offeringFor = item.id;
            select.setAttribute("aria-label", `Class time for ${item.name}`);
            select.append(new Option("Choose a class time", ""));
            for (const option of options) select.append(new Option(classTime(option), option.offeringID));
            select.value = chosen ? String(chosen.offeringID) : "";
            select.addEventListener("change", () => {
              try {
                render(saveTerm(destination, term, old => ({
                  ...old, courses: old.courses.map(course => course.id === item.id
                    ? { ...course, offeringID: select.value ? Number(select.value) : null } : course),
                })));
                list.querySelector(`[data-offering-for="${item.id}"]`)?.focus();
              } catch {
                status.textContent = "Could not save the class time.";
              }
            });
            label.append(select);
          }
        }
        const remove = document.createElement("button");
        remove.className = "row-action";
        remove.type = "button";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", `Remove ${item.name}`);
        remove.addEventListener("click", () => {
          try {
            render(saveTerm(destination, term, old => ({
              ...old, courses: old.courses.filter(course => course.id !== item.id),
            })));
            refreshButtons();
            picker.querySelector("summary").focus();
          } catch {
            status.textContent = "Could not save changes in this browser.";
          }
        });
        row.append(label, remove);
        list.append(row);
      }
    }

    function refresh() {
      try {
        render(termPlan(readPlans(), destination, term));
      } catch {
        field.disabled = true;
        status.textContent = "Browser storage is unavailable.";
      }
    }

    field.addEventListener("input", () => {
      if (!field.checkValidity()) {
        status.textContent = "Enter a whole number from 1 to 999.";
        status.dataset.met = "false";
        return;
      }
      try {
        render(saveTerm(destination, term, entry => ({
          ...entry, target: field.value === "" ? null : field.valueAsNumber,
        })), false);
      } catch {
        status.textContent = "Could not save changes in this browser.";
      }
    });

    renderers.push(refresh);
    refresh();
  }

  const refreshPage = () => renderers.forEach(render => render());
  loadCatalogue(destination).then(rows => {
    catalogue = rows;
    refreshPage();
  }).catch(() => {
    catalogueFailed = true;
    refreshPage();
  });
  window.addEventListener("pageshow", refreshPage);
  window.addEventListener("storage", refreshPage);
})();
