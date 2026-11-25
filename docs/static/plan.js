"use strict";

const planParams = new URLSearchParams(window.location.search);
const { destinations, semesters } = JSON.parse(document.getElementById("exchange-choices").textContent);
const destination = planParams.get("destination");
const semester = planParams.get("semester");
const campus = destinations.find(([id]) => String(id) === destination);
const planForm = document.getElementById("exchange-plan");

if (planForm) {
  if (campus) planForm.elements.destination.value = destination;
  if (semesters.includes(semester)) planForm.elements.semester.value = semester;
}

if (campus && semesters.includes(semester)) {
  const route = document.querySelector("[data-plan-route]");
  route.textContent = `HKU → ${campus[1]} · ${semester}`;
  route.hidden = false;

  const searchPanel = document.querySelector("[data-plan-search]");
  if (searchPanel) {
    searchPanel.querySelector("[data-plan-default]").value = destination;
    searchPanel.hidden = false;
  }

  const context = { destination, semester };
  for (const link of document.querySelectorAll("[data-plan-link]")) {
    const url = new URL(link.href);
    for (const [name, value] of Object.entries(context)) url.searchParams.set(name, value);
    link.href = url.href;
  }

  for (const form of document.querySelectorAll("[data-preserve-plan]")) {
    for (const [name, value] of Object.entries(context)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      input.dataset.planContext = "";
      form.append(input);
    }

    for (const [name, value] of Object.entries({ uni_id: destination, term: semester })) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLSelectElement && !planParams.has(name)) field.value = value;
    }

    for (const option of form.querySelectorAll("option[data-destination]")) {
      const outsidePlan = option.dataset.destination !== destination ||
        (option.dataset.semester && option.dataset.semester !== semester);
      if (outsidePlan) {
        if (option.selected) option.closest("select").value = "";
        option.disabled = true;
        option.hidden = true;
      }
    }
  }
}
