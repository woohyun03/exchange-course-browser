"use strict";

(() => {
  const storageKey = "comp3278-exchange-planner:plans:v1";
  const buttons = new Map();
  const catalogues = new Map();

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

  function saveTerm(destination, term, update) {
    const plans = readPlans();
    const entry = update(termPlan(plans, destination, term));
    plans[destination] = { ...plans[destination], [term]: entry };
    localStorage.setItem(storageKey, JSON.stringify(plans));
    return entry;
  }

  function setButton(button, selected) {
    button.textContent = selected ? "Added to My Plan" : "Add to My Plan";
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
      setButton(button, termPlan(plans, destination, term).courses.some(course => course.id === id));
    }
  }

  window.exchangePlan = {
    loadCatalogue,
    bindCourse(button, destination, term, course, onChange) {
      const item = { id: course.courseID, name: course.courseName, credits: course.credits };
      try {
        const entry = termPlan(readPlans(), destination, term);
        setButton(button, entry.courses.some(saved => saved.id === item.id));
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

  const page = document.querySelector("[data-personal-plan]");
  if (!page) {
    window.addEventListener("pageshow", refreshButtons);
    window.addEventListener("storage", refreshButtons);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const choices = JSON.parse(document.getElementById("exchange-choices").textContent);
  const destination = params.get("destination");
  if (!choices.destinations.some(([id]) => String(id) === destination) ||
      !choices.semesters.includes(params.get("semester"))) return;

  document.querySelector("[data-plan-setup]").hidden = true;
  page.hidden = false;

  const renderers = [];
  for (const panel of page.querySelectorAll("[data-term]")) {
    const term = panel.dataset.term;
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
        const unique = new Map();
        for (const course of rows) {
          if (course.term === term) unique.set(course.courseID, course);
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
        credits.textContent = `${item.credits} credits`;
        label.append(name, credits);
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
  window.addEventListener("pageshow", refreshPage);
  window.addEventListener("storage", refreshPage);
})();
