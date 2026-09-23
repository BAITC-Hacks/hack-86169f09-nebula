/* Backend integration. Existing standalone file:// UI remains usable separately. */
if (location.protocol !== "file:") {
  let searchController;
  let searchRevision = 0;

  submitSearch = async function () {
    const revision = ++searchRevision;
    if (searchController) searchController.abort();
    searchController = new AbortController();
    if (!form.reportValidity()) return;
    const payload = {
      city: cityInput.value,
      category: categoryInput.value,
      event_format: formatInput.value,
      event_date: dateInput.value,
      budget: Number(budgetInput.value),
      language: languageInput.value || null,
      duration: durationInput.value ? Number(durationInput.value) : null,
      contractors,
      use_ai: true
    };
    resultTitle.textContent = "Проверяем условия…";
    resultMeta.textContent = "";
    resultContainer.replaceChildren();
    try {
      const response = await fetch("/api/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: searchController.signal
      });
      const result = await response.json();
      if (!response.ok) {
        const message = Array.isArray(result.detail)
          ? result.detail.map(e => e.loc.join(".") + ": " + e.msg).join("; ")
          : result.detail || "Ошибка сервера";
        throw new Error(message);
      }
      if (revision !== searchRevision) return;
      resultTitle.textContent = result.status === "matched" ? "Подобрали " + result.results.length + " из " + result.total_matched
        : result.status === "no_category" ? "В этом городе такой категории нет" : "Кандидаты есть, но условия не пройдены";
      resultMeta.textContent = result.message + (result.warning ? " " + result.warning : "");
      if (result.status !== "matched") {
        renderState("no-match", "Результат проверки", result.message);
        return;
      }
      for (const { contractor: item, explanation } of result.results) {
        const fragment = byId("contractorTemplate").content.cloneNode(true);
        fragment.querySelector(".category-label").textContent = payload.category;
        fragment.querySelector(".score-label").textContent = "Подходит";
        fragment.querySelector(".contractor-name").textContent = item.anon_name;
        fragment.querySelector(".contractor-meta").textContent = item.city + " · от " + formatMoney(item.price_from_kzt) + " · "
          + (item.max_hours === null ? "не привязано к часам присутствия" : "до " + item.max_hours + " ч");
        fragment.querySelector(".contractor-explanation").textContent = explanation;
        fragment.querySelector(".exclusion-summary").textContent = result.message
          + " Один кандидат может не пройти несколько условий.";
        const tags = [...item.languages];
        if (item.synthetic) tags.push("синтетический профиль");
        if (item.city_imputed) tags.push("город восстановлен");
        if (item.price_imputed) tags.push("цена восстановлена");
        for (const text of tags) {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = text;
          fragment.querySelector(".tag-list").append(tag);
        }
        resultContainer.append(fragment);
      }
    } catch (error) {
      if (error.name === "AbortError" || revision !== searchRevision) return;
      resultTitle.textContent = "Не удалось выполнить поиск";
      renderState("error", "Проверьте данные и сервер", error.message);
    }
  };

  byId("resetButton").addEventListener("click", () => {
    searchRevision++;
    if (searchController) searchController.abort();
  });

  // Load the actual server catalogue without changing another user's dataset.
  let datasetTouched = false;
  byId("datasetInput").addEventListener("change", () => { datasetTouched = true; });
  byId("loadDemoButton").addEventListener("click", () => { datasetTouched = true; });
  fetch("/api/catalog").then(response => {
    if (!response.ok) throw new Error("Каталог сервера недоступен");
    return response.json();
  }).then(data => {
    if (!datasetTouched) setDataset(data.items, data.source);
  }).catch(error => datasetError(error.message + ". Запустите сайт через python run.py."));
}
