/* Same-origin FastAPI transport, called explicitly by app.js. */
  let searchController;
  let searchRevision = 0;

  function cancelBackendSearch() {
    searchRevision++;
    if (searchController) searchController.abort();
  }

  async function submitBackendSearch() {
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
      use_ai: true
    };
    // Ordinary searches use the server's validated CSV, without resending it.
    // Uploaded CSV/demo data stays specific to this visitor's request.
    if (!serverCatalogAvailable) payload.contractors = contractors;
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
        const tags = item.languages.map(text => ({ text, warn: false }));
        if (item.synthetic) tags.push({ text: "синтетический профиль", warn: true });
        if (item.city_imputed) tags.push({ text: "город восстановлен", warn: true });
        if (item.price_imputed) tags.push({ text: "цена восстановлена", warn: true });
        for (const { text, warn } of tags) {
          const tag = document.createElement("span");
          tag.className = "tag" + (warn ? " warn" : "");
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
  }

  async function loadServerCatalog() {
    const revision = datasetRevision;
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      if (!response.ok) throw new Error("Каталог сервера недоступен");
      const data = await response.json();
      if (revision === datasetRevision) {
        setDataset(data.items, data.source, true);
        byId("datasetSummary").className = "";
      }
    } catch (error) {
      if (revision === datasetRevision) datasetError(error.message + ". Обновите страницу после запуска сервера.");
    }
  }
