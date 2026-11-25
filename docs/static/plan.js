"use strict";

(() => {
  const params = new URLSearchParams(window.location.search);
  const { destinations, semesters } = JSON.parse(document.getElementById("exchange-choices").textContent);
  const photos = JSON.parse(document.getElementById("campus-photos").textContent);
  const chosenCampus = destinations.find(([id]) => String(id) === params.get("destination"));
  const semester = params.get("semester");
  const planForm = document.getElementById("exchange-setup");
  const mainForm = document.querySelector("form[data-feature]");

  function showPlan(campus, term) {
    const [id, name] = campus;
    const appearance = photos[id];
    for (const label of document.querySelectorAll("[data-destination-name]")) label.textContent = name;
    for (const label of document.querySelectorAll("[data-semester-name]")) {
      label.textContent = term.replace("Sem ", "Semester ");
    }
    for (const badge of document.querySelectorAll("[data-destination-badge]")) {
      badge.textContent = appearance?.badge ?? "";
      badge.dataset.school = appearance?.theme ?? "";
      badge.hidden = !appearance;
    }

    const photo = document.querySelector("[data-campus-photo]");
    const source = document.getElementById("campus-images")?.content.querySelector(`[data-campus="${id}"]`);
    if (photo && source && appearance) {
      photo.src = source.getAttribute("src");
      photo.alt = source.alt;
      document.querySelector("[data-campus-place]").textContent = appearance.city;
      const credit = document.querySelector("[data-campus-credit]");
      credit.textContent = appearance.credit;
      credit.href = appearance.source;
      const license = document.querySelector("[data-campus-license]");
      license.textContent = appearance.license;
      license.href = appearance.license_url;
    }
  }

  if (planForm) {
    if (chosenCampus) planForm.elements.destination.value = chosenCampus[0];
    if (semesters.includes(semester)) planForm.elements.semester.value = semester;
    const updateRoute = () => {
      const selected = destinations.find(([id]) => String(id) === planForm.elements.destination.value);
      if (selected) showPlan(selected, planForm.elements.semester.value);
    };
    planForm.addEventListener("change", updateRoute);
    updateRoute();
  }

  if (!chosenCampus || !semesters.includes(semester) || !mainForm) return;
  const [id] = chosenCampus;
  const destination = String(id);
  const context = { destination, semester };
  showPlan(chosenCampus, semester);
  document.querySelector("[data-plan-route]").hidden = false;

  for (const link of document.querySelectorAll("[data-plan-link]")) {
    const url = new URL(link.href);
    for (const [name, value] of Object.entries(context)) url.searchParams.set(name, value);
    link.href = url.href;
  }

  for (const [name, value] of Object.entries(context)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    input.dataset.planContext = "";
    mainForm.append(input);
  }

  for (const [name, value] of Object.entries({ uni_id: destination, term: semester })) {
    const field = mainForm.elements.namedItem(name);
    if (field instanceof HTMLSelectElement) {
      field.value = params.has(name) ? params.get(name) : value;
      field.closest("label").hidden = field.value === value;
    }
  }

  for (const option of mainForm.querySelectorAll("option[data-destination]")) {
    const outsidePlan = option.dataset.destination !== destination ||
      (option.dataset.semester && option.dataset.semester !== semester);
    if (outsidePlan) {
      if (option.selected) option.closest("select").value = "";
      option.disabled = true;
      option.hidden = true;
    }
  }

  const student = mainForm.elements.namedItem("student_id");
  if (student && !params.has("student_id") && !student.value) {
    const first = [...student.options].find(option => option.value && !option.disabled);
    if (first) student.value = first.value;
  }

  if (mainForm.hasAttribute("data-run-with-plan") &&
      [...mainForm.querySelectorAll("label")].every(label => label.hidden)) {
    mainForm.hidden = true;
  }
})();
