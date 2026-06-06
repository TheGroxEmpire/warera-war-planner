const SKILL_NAMES = ["Attack", "Precision", "Crit. Chance", "Crit. Dmg", "Armor", "Dodge", "Health", "Hunger", "Loot"];

document.addEventListener("DOMContentLoaded", () => {
    const resultsDiv = document.getElementById("results");
    const campaignResultsDiv = document.getElementById("campaign-results");
    const buildForm = document.getElementById("build-form");
    const optimizeBtns = buildForm.querySelectorAll(".optimize-btn");
    const workersInput = document.getElementById("workers");
    const samplesInput = document.getElementById("samples");
    const advancedConfig = document.getElementById("advanced-config");
    const importEcoLinkBtn = document.getElementById("import-eco-link-btn");
    const ecoExportUrlInput = document.getElementById("eco-export-url");
    const ecoImportStatus = document.getElementById("eco-import-status");
    const warSkillSummary = document.getElementById("war-skill-summary");

    updateAdvancedPlaceholders();

    let allBuilds = [];
    let viewMode = 'card';
    let sortCol = null;
    let sortDir = 1;
    let currentObjective = 'damage';

    const viewControls = document.getElementById('view-controls');
    const viewCardsBtn = document.getElementById('view-cards-btn');
    const viewTableBtn = document.getElementById('view-table-btn');

    viewCardsBtn.addEventListener('click', () => {
        viewMode = 'card';
        viewCardsBtn.classList.add('active');
        viewTableBtn.classList.remove('active');
        renderBuilds(allBuilds, currentObjective);
    });

    viewTableBtn.addEventListener('click', () => {
        viewMode = 'table';
        viewTableBtn.classList.add('active');
        viewCardsBtn.classList.remove('active');
        renderBuilds(allBuilds, currentObjective);
    });

    // --- Slider and Input Synchronization ---
    const syncSliderAndInput = (sliderId, inputId) => {
        const slider = document.getElementById(sliderId);
        const input = document.getElementById(inputId);

        const updateSliderBackground = () => {
            const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
            slider.style.background = `linear-gradient(to right, rgb(160, 0, 0) ${value}%, #333 ${value}%)`;
        };

        slider.addEventListener("input", () => {
            input.value = slider.value;
            updateSliderBackground();
        });

        input.addEventListener("input", () => {
            slider.value = input.value;
            updateSliderBackground();
        });

        updateSliderBackground(); // Initial update
    };

    syncSliderAndInput("level-slider", "level-input");
    syncSliderAndInput("rank_bonus-slider", "rank_bonus-input");
    syncSliderAndInput("battle_bonus-slider", "battle_bonus-input");

    // --- Form Submission ---
    let isOptimizing = false;

    buildForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (isOptimizing) return;

        const submitter = event.submitter;
        const data = new FormData(buildForm);
        data.set('objective', submitter.value);
        const submitterLabel = submitter.innerHTML;
        currentObjective = submitter.value;

        resultsDiv.innerHTML = "";
        renderCampaignResults({ active: false }, []);
        optimizeBtns.forEach(b => b.disabled = true);
        submitter.innerHTML = `<span class="spinner"></span><span>OPTIMIZING</span>`;
        isOptimizing = true;

        try {
            if (!window.WareraBrowserOptimizer) {
                throw new Error("Browser optimizer is not available.");
            }

            renderProgress({ phase: "preparing" });
            const results = await window.WareraBrowserOptimizer.run(data, {
                onProgress: renderProgress,
            });
            const campaign = getCampaignSettings();
            allBuilds = applyCampaignToBuilds(results.builds || [], campaign, submitter.value);
            renderCampaignResults(campaign, allBuilds);

            renderBuilds(allBuilds, submitter.value);

        } catch (error) {
            console.error("Optimization error:", error);
            resultsDiv.innerHTML = `<p class="error">${escapeHtml(error.message || "An error occurred during optimization. Please try again later.")}</p>`;
        } finally {
            optimizeBtns.forEach(b => b.disabled = false);
            submitter.innerHTML = submitterLabel;
            isOptimizing = false;
        }
    });

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatMoney(value) {
        const num = Number(value || 0);
        const sign = num < 0 ? "-" : "";
        const abs = Math.abs(num);
        if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(2)}M`;
        if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
        return `${sign}${abs.toFixed(2)}`;
    }

    function parseNumericInput(id, fallback = 0) {
        const value = Number.parseFloat(document.getElementById(id)?.value || "");
        return Number.isFinite(value) ? value : fallback;
    }

    function setInputValue(id, value) {
        const input = document.getElementById(id);
        if (!input || value === undefined || value === null) return;
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function setSliderPair(baseId, value) {
        const normalized = String(value);
        const input = document.getElementById(`${baseId}-input`);
        const slider = document.getElementById(`${baseId}-slider`);
        if (input) input.value = normalized;
        if (slider) {
            slider.value = normalized;
            slider.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }

    function base64UrlToBytes(value) {
        const normalized = String(value || "").trim().replace(/-/g, "+").replace(/_/g, "/");
        if (!normalized) throw new Error("Export link is empty.");
        const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
        const binary = atob(padded);
        return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    }

    async function gunzipText(bytes) {
        if (typeof DecompressionStream !== "function") {
            throw new Error("Compressed export links are not supported in this browser.");
        }
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        return new Response(stream).text();
    }

    async function decodeBase64UrlJson(value) {
        const raw = String(value || "").trim();
        if (raw.startsWith("gz.")) {
            return JSON.parse(await gunzipText(base64UrlToBytes(raw.slice(3))));
        }
        if (raw.startsWith("js.")) {
            return JSON.parse(new TextDecoder().decode(base64UrlToBytes(raw.slice(3))));
        }
        return JSON.parse(new TextDecoder().decode(base64UrlToBytes(raw)));
    }

    function extractExportPayloadValue(rawValue) {
        const raw = String(rawValue || "").trim();
        if (!raw) throw new Error("Paste the Eco Simulator export link first.");

        let url = null;
        try {
            url = new URL(raw);
        } catch {
            return raw;
        }
        const plannerExport = url.searchParams.get("wareraPlannerExport") || url.searchParams.get("eco");
        if (plannerExport) return plannerExport;
        if (url.searchParams.has("wareraEcoConfig")) {
            throw new Error("Paste the War Planner Export link, not the Share Simulation Configuration link.");
        }
        return raw;
    }

    function normalizeScenario(rawScenario) {
        if (!rawScenario || typeof rawScenario !== "object") return null;
        const skillLevels = rawScenario.skillLevels && typeof rawScenario.skillLevels === "object"
            ? rawScenario.skillLevels
            : {};
        return {
            level: Math.max(1, Math.floor(Number(rawScenario.level) || 1)),
            profitDay: Number(rawScenario.profitDay) || 0,
            profitHour: Number(rawScenario.profitHour) || 0,
            companiesActive: Math.max(0, Math.floor(Number(rawScenario.companiesActive) || 0)),
            companiesConfigured: Math.max(0, Math.floor(Number(rawScenario.companiesConfigured) || 0)),
            reservedSkillPoints: Math.max(0, Math.floor(Number(rawScenario.reservedSkillPoints) || 0)),
            skillLevels: {
                energy: Math.max(0, Math.floor(Number(skillLevels.energy) || 0)),
                entrepreneurship: Math.max(0, Math.floor(Number(skillLevels.entrepreneurship) || 0)),
                production: Math.max(0, Math.floor(Number(skillLevels.production) || 0)),
                companies: Math.max(0, Math.floor(Number(skillLevels.companies) || 0)),
                management: Math.max(0, Math.floor(Number(skillLevels.management) || 0)),
            },
            user: rawScenario.user && typeof rawScenario.user === "object" ? rawScenario.user : null,
        };
    }

    async function parseEcoSimulatorExport(rawValue) {
        const encoded = extractExportPayloadValue(rawValue);
        const payload = await decodeBase64UrlJson(encoded);
        if (!payload || payload.source !== "warera-eco-simulator" || !payload.scenarios) {
            throw new Error("That link is not a WarEra Eco Simulator export.");
        }
        return {
            eco: normalizeScenario(payload.scenarios.eco),
            war: normalizeScenario(payload.scenarios.war),
            generatedAt: payload.generatedAt || null,
        };
    }

    function clampSelectValue(select, value) {
        if (!select) return;
        const values = Array.from(select.options).map((option) => Number(option.value));
        const min = Math.min(...values);
        const max = Math.max(...values);
        const clamped = Math.min(max, Math.max(min, Math.floor(Number(value) || min)));
        select.value = String(clamped);
    }

    function updateWarSkillSummary(warScenario) {
        const reserved = Math.max(0, Math.floor(parseNumericInput("reserved_skill_points", 0)));
        const companiesLevel = warScenario?.skillLevels?.companies || 0;
        const managementLevel = warScenario?.skillLevels?.management || 0;
        const activeCompanies = warScenario?.companiesActive || Number(document.getElementById("companies")?.value || 2);
        const text = `War eco skills reserve ${reserved} skill points before combat optimization. Companies skill ${companiesLevel}, management skill ${managementLevel}, active war companies ${activeCompanies}.`;
        if (warSkillSummary) {
            warSkillSummary.textContent = text;
            warSkillSummary.classList.toggle("imported", reserved > 0);
        }
    }

    async function importEcoSimulatorLink() {
        try {
            const imported = await parseEcoSimulatorExport(ecoExportUrlInput.value);
            if (!imported.eco && !imported.war) {
                throw new Error("The export does not include eco or war scenario data.");
            }

            const level = imported.war?.level || imported.eco?.level;
            if (level) setSliderPair("level", level);
            if (imported.eco) setInputValue("eco_profit_day", imported.eco.profitDay.toFixed(2));
            if (imported.war) {
                setInputValue("war_profit_day", imported.war.profitDay.toFixed(2));
                setInputValue("reserved_skill_points", imported.war.reservedSkillPoints);
                clampSelectValue(document.getElementById("companies"), imported.war.companiesActive || imported.war.companiesConfigured);
            }

            saveFormState();
            updateWarSkillSummary(imported.war);

            const userLabel = imported.war?.user?.username || imported.eco?.user?.username || "";
            const generatedLabel = imported.generatedAt ? ` Exported ${new Date(imported.generatedAt).toLocaleString()}.` : "";
            if (ecoImportStatus) {
                ecoImportStatus.textContent = `Imported ${userLabel ? `${userLabel}'s ` : ""}eco and war factory config.${generatedLabel}`;
                ecoImportStatus.classList.add("imported");
            }
        } catch (error) {
            if (ecoImportStatus) {
                ecoImportStatus.textContent = error.message || "Could not import that export link.";
                ecoImportStatus.classList.remove("imported");
            }
        }
    }

    function getCampaignSettings() {
        const ecoDays = Math.max(0, Math.floor(parseNumericInput("eco_days", 0)));
        const warDays = Math.max(0, Math.floor(parseNumericInput("war_days", 1)));
        const ecoProfitDay = parseNumericInput("eco_profit_day", 0);
        const warProfitDay = parseNumericInput("war_profit_day", 0);
        const reservedSkillPoints = Math.max(0, Math.floor(parseNumericInput("reserved_skill_points", 0)));
        const ecoBudget = ecoProfitDay * ecoDays;
        const warIncome = warProfitDay * warDays;
        const totalBudget = ecoBudget + warIncome;
        return {
            ecoDays,
            warDays,
            ecoProfitDay,
            warProfitDay,
            reservedSkillPoints,
            ecoBudget,
            warIncome,
            totalBudget,
            active: ecoDays > 0 || warDays > 0 || ecoProfitDay !== 0 || warProfitDay !== 0 || reservedSkillPoints > 0,
        };
    }

    function applyCampaignToBuilds(builds, campaign, objective) {
        if (!campaign.active) {
            return builds;
        }

        const annotated = builds.map((build) => {
            const warNetCost = Number(build.net_cost) || 0;
            const warTotalCost = warNetCost * campaign.warDays;
            const remainingBudget = campaign.totalBudget - warTotalCost;
            const sustainable = remainingBudget >= -0.000001;
            const budgetUsagePct = campaign.totalBudget > 0 ? (warTotalCost / campaign.totalBudget) * 100 : 0;
            return {
                ...build,
                campaign: {
                    warNetCost,
                    warTotalCost,
                    remainingBudget,
                    sustainable,
                    budgetUsagePct,
                },
            };
        });

        const metricKey = objective === "cases" ? "cases_per_day" : "total_damage";
        const sustainableBuilds = annotated.filter((build) => build.campaign.sustainable)
            .sort((a, b) => (b[metricKey] || 0) - (a[metricKey] || 0));
        const unsustainableBuilds = annotated.filter((build) => !build.campaign.sustainable)
            .sort((a, b) => b.campaign.remainingBudget - a.campaign.remainingBudget);

        if (sustainableBuilds[0]) {
            sustainableBuilds[0].is_recommended = true;
        }
        return [...sustainableBuilds, ...unsustainableBuilds];
    }

    function renderCampaignResults(campaign, builds) {
        if (!campaignResultsDiv) return;
        if (!campaign.active) {
            campaignResultsDiv.style.display = "none";
            campaignResultsDiv.innerHTML = "";
            return;
        }

        const sustainableCount = builds.filter((build) => build.campaign?.sustainable).length;
        campaignResultsDiv.style.display = "";
        campaignResultsDiv.innerHTML = `
            <div class="campaign-results-grid">
                <span><span class="campaign-results-label">Eco Stockpile</span><span class="campaign-results-value">${formatMoney(campaign.ecoBudget)}</span></span>
                <span><span class="campaign-results-label">War Income</span><span class="campaign-results-value">${formatMoney(campaign.warIncome)}</span></span>
                <span><span class="campaign-results-label">War Budget</span><span class="campaign-results-value">${formatMoney(campaign.totalBudget)}</span></span>
                <span><span class="campaign-results-label">War Days</span><span class="campaign-results-value">${campaign.warDays}</span></span>
                <span><span class="campaign-results-label">Reserved Skill Points</span><span class="campaign-results-value">${campaign.reservedSkillPoints}</span></span>
                <span><span class="campaign-results-label">Sustainable Builds</span><span class="campaign-results-value">${sustainableCount} / ${builds.length}</span></span>
            </div>
        `;
    }

    function renderProgress(progress) {
        if (progress.phase === "preparing") {
            resultsDiv.innerHTML = `
                <div class="optimizer-progress">
                    <div class="progress-header">
                        <span>Preparing Local Optimizer</span>
                        <span>Auto</span>
                    </div>
                    <div class="progress-track"><div class="progress-fill indeterminate"></div></div>
                </div>
            `;
            return;
        }

        if (progress.phase === "prices") {
            resultsDiv.innerHTML = `
                <div class="optimizer-progress">
                    <div class="progress-header">
                        <span>Refreshing Market Prices</span>
                        <span>API</span>
                    </div>
                    <div class="progress-track"><div class="progress-fill indeterminate"></div></div>
                </div>
            `;
            return;
        }

        if (progress.phase === "prices-fallback") {
            resultsDiv.innerHTML = `
                <div class="optimizer-progress">
                    <div class="progress-header">
                        <span>Using Bundled Prices</span>
                        <span>Local</span>
                    </div>
                    <div class="progress-track"><div class="progress-fill" style="width:100%"></div></div>
                </div>
            `;
            return;
        }

        const total = Number(progress.total || 0);
        const evaluated = Number(progress.evaluated || 0);
        const percent = total > 0 ? Math.min(100, Math.max(0, evaluated / total * 100)) : 0;
        const workerLabel = progress.workers === "auto" ? "Auto" : `${progress.workers} Threads`;

        resultsDiv.innerHTML = `
            <div class="optimizer-progress">
                <div class="progress-header">
                    <span>${formatProgressNumber(evaluated)} / ${formatProgressNumber(total)} configs</span>
                    <span>${workerLabel}</span>
                </div>
                <div class="progress-track"><div class="progress-fill" style="width:${percent.toFixed(1)}%"></div></div>
            </div>
        `;
    }

    function formatProgressNumber(value) {
        if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
        if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
        return String(Math.floor(value));
    }

    // --- localStorage Persistence ---
    function saveFormState() {
        localStorage.setItem('wbt_level', document.getElementById('level-input').value);
        localStorage.setItem('wbt_rank_bonus', document.getElementById('rank_bonus-input').value);
        localStorage.setItem('wbt_battle_bonus', document.getElementById('battle_bonus-input').value);
        localStorage.setItem('wbt_warera_api_key', document.getElementById('warera_api_key').value);
        localStorage.setItem('wbt_companies', document.getElementById('companies').value);
        localStorage.setItem('wbt_pill', document.getElementById('pill').checked);
        localStorage.setItem('wbt_samples', document.getElementById('samples').value);
        localStorage.setItem('wbt_workers', document.getElementById('workers').value);
        localStorage.setItem('wbt_eco_days', document.getElementById('eco_days').value);
        localStorage.setItem('wbt_war_days', document.getElementById('war_days').value);
        localStorage.setItem('wbt_eco_profit_day', document.getElementById('eco_profit_day').value);
        localStorage.setItem('wbt_war_profit_day', document.getElementById('war_profit_day').value);
        localStorage.setItem('wbt_reserved_skill_points', document.getElementById('reserved_skill_points').value);
        if (advancedConfig) localStorage.setItem('wbt_advanced_open', advancedConfig.open);
    }

    function restoreFormState() {
        const level = localStorage.getItem('wbt_level');
        if (level) {
            document.getElementById('level-input').value = level;
            document.getElementById('level-slider').value = level;
        }

        const rankBonus = localStorage.getItem('wbt_rank_bonus');
        if (rankBonus) {
            document.getElementById('rank_bonus-input').value = rankBonus;
            document.getElementById('rank_bonus-slider').value = rankBonus;
        }

        const battleBonus = localStorage.getItem('wbt_battle_bonus');
        if (battleBonus) {
            document.getElementById('battle_bonus-input').value = battleBonus;
            document.getElementById('battle_bonus-slider').value = battleBonus;
        }

        const apiKey = localStorage.getItem('wbt_warera_api_key');
        if (apiKey) document.getElementById('warera_api_key').value = apiKey;

        const companies = localStorage.getItem('wbt_companies');
        if (companies) document.getElementById('companies').value = companies;

        const pill = localStorage.getItem('wbt_pill');
        if (pill !== null) document.getElementById('pill').checked = pill === 'true';

        const campaignFields = [
            ['wbt_eco_days', 'eco_days'],
            ['wbt_war_days', 'war_days'],
            ['wbt_eco_profit_day', 'eco_profit_day'],
            ['wbt_war_profit_day', 'war_profit_day'],
            ['wbt_reserved_skill_points', 'reserved_skill_points'],
        ];
        campaignFields.forEach(([storageKey, inputId]) => {
            const value = localStorage.getItem(storageKey);
            if (value !== null) document.getElementById(inputId).value = value;
        });

        const advancedOpen = localStorage.getItem('wbt_advanced_open');
        const shouldRestoreAdvancedOverrides = advancedOpen !== null;

        const samples = localStorage.getItem('wbt_samples');
        if (shouldRestoreAdvancedOverrides && samples && samples !== 'auto') {
            document.getElementById('samples').value = samples;
        }

        const workers = localStorage.getItem('wbt_workers');
        if (shouldRestoreAdvancedOverrides && workers && workers !== 'auto') {
            document.getElementById('workers').value = workers;
        }

        if (advancedConfig && advancedOpen !== null) advancedConfig.open = advancedOpen === 'true';

        // Re-trigger slider backgrounds after restoring values
        ['level', 'rank_bonus', 'battle_bonus'].forEach(id => {
            document.getElementById(`${id}-slider`).dispatchEvent(new Event('input'));
        });
    }

    function updateAdvancedPlaceholders() {
        const hardwareConcurrency = navigator.hardwareConcurrency || 4;
        if (workersInput) workersInput.placeholder = `Auto (${hardwareConcurrency})`;
        if (!samplesInput || !window.WareraBrowserOptimizer) return;

        const level = Number.parseInt(document.getElementById("level-input").value || "1", 10);
        const manualWorkers = workersInput ? Number.parseInt(workersInput.value || "", 10) : NaN;
        const workers = Number.isFinite(manualWorkers) && manualWorkers > 0 ? manualWorkers : hardwareConcurrency;
        const autoSamples = window.WareraBrowserOptimizer.estimateAutoSamples({
            level: Number.isFinite(level) ? level : 1,
            workers,
            objective: "damage",
        });
        samplesInput.placeholder = `Auto (~${formatProgressNumber(autoSamples)})`;
    }

    buildForm.addEventListener('input', saveFormState);
    buildForm.addEventListener('change', saveFormState);
    buildForm.addEventListener('input', updateAdvancedPlaceholders);
    buildForm.addEventListener('input', () => updateWarSkillSummary(null));
    if (importEcoLinkBtn && ecoExportUrlInput) {
        importEcoLinkBtn.addEventListener('click', importEcoSimulatorLink);
        ecoExportUrlInput.addEventListener('keydown', (event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                importEcoSimulatorLink();
            }
        });
    }
    if (advancedConfig) {
        advancedConfig.addEventListener('toggle', saveFormState);
    }

    restoreFormState();
    updateWarSkillSummary(null);
    updateAdvancedPlaceholders();


    // --- Render Builds ---
    function renderBuilds(builds, objective = 'damage') {
        if (!builds || builds.length === 0) {
            viewControls.style.display = 'none';
            resultsDiv.innerHTML = "<p>No optimal builds found. Please adjust your parameters and try again.</p>";
            return;
        }

        viewControls.style.display = '';

        if (viewMode === 'table') {
            renderTable(builds);
            return;
        }

        resultsDiv.innerHTML = builds.map(d => {
            const skillsHtml = d.skill_lvls.map((level, i) => {
                const statVal = d.diag && d.diag.skill_stats ? d.diag.skill_stats[i] : null;
                let tooltipText = SKILL_NAMES[i];
                if (statVal !== null) {
                    const isPct = (i >= 1 && i <= 3) || i === 8;  // Precision, Crit.Chance, Crit.Dmg, Loot are %
                    if (i === 4 || i === 5) {  // Armor or Dodge
                        const stat = Number(statVal);
                        const pct = (stat / (stat + 40) * 100).toFixed(1);
                        tooltipText += `: ${stat.toFixed(1)} (${pct}%)`;
                    } else {
                        tooltipText += `: ${Number(statVal).toFixed(isPct ? 0 : 1)}${isPct ? '%' : ''}`;
                    }
                }
                return `
                    <div class='skill'>
                        <svg><use xlink:href='#skill-svg-${i + 1}'></use></svg>
                        ${level}
                        <span class='skill-name'>${tooltipText}</span>
                    </div>
                `;
            }).join("");

            const gearHtml = d.gear.filter(g => !g.is_none).map(g => `
                <div class='gear-item' style='background-color: ${g.color}'>
                    <img src='static/images/${g.image_name}.png' alt='${g.slot}'>
                    <span class='quantity-label'>x ${(Number(g.quantity)*100).toFixed(0)} %</span>
                </div>
            `).join("");

            const isCasesMode = objective === 'cases';
            const primaryStatHtml = isCasesMode
                ? `${d.cases_per_day_formatted} Cases<span class='damage-label'>Cases per day</span><span class='damage-secondary'>${d.total_damage_formatted} DMG<span class='damage-label'>Daily damage</span></span>`
                : `${d.total_damage_formatted} DMG<span class='damage-label'>Average daily damage</span>`;
            const efficiencyHtml = isCasesMode
                ? `${d.cases_per_day > 0 ? (d.net_cost / d.cases_per_day).toFixed(2) : '\u221e'} $/Case<span class='efficiency-label'>Net cost per case</span>`
                : `${(d.net_cost / d.total_damage * 1000).toFixed(2)} $/K<span class='efficiency-label'>Net cost per 1K damage</span>`;

            const cardClass = `${d.is_recommended ? " recommended-card" : ""}${d.is_highest_damage ? " highest-damage-card" : (d.is_max_damage ? " max-damage-card" : "")}`;
            const campaignHtml = d.campaign ? `
                    <div class='card-campaign ${d.campaign.sustainable ? "sustainable" : "unsustainable"}'>
                        <h3>${d.is_recommended ? "Recommended Campaign Build" : "Campaign Sustain"}</h3>
                        <div class='campaign-card-grid'>
                            <span><b>${d.campaign.sustainable ? "Sustain" : "Over Budget"}</b><small>Status</small></span>
                            <span><b>${formatMoney(d.campaign.warTotalCost)}</b><small>War net cost</small></span>
                            <span><b>${formatMoney(d.campaign.remainingBudget)}</b><small>Remaining</small></span>
                            <span><b>${Number.isFinite(d.campaign.budgetUsagePct) ? d.campaign.budgetUsagePct.toFixed(1) : "0.0"}%</b><small>Budget used</small></span>
                        </div>
                    </div>
            ` : "";
            return `
                <div class='card${cardClass}'>
                    <div class='card-damage'>${primaryStatHtml}</div>
                    <div class='card-cost'><div class='cost-left'><svg stroke='currentColor' fill='currentColor' stroke-width='0' viewBox='0 0 24 24' height='1em' width='1em' xmlns='http://www.w3.org/2000/svg' style='width: 1em; height: 1em; paint-order: stroke; stroke-linecap: round; stroke-linejoin: round;'><path d='M12 5C7.031 5 2 6.546 2 9.5S7.031 14 12 14c4.97 0 10-1.546 10-4.5S16.97 5 12 5zm-5 9.938v3c1.237.299 2.605.482 4 .541v-3a21.166 21.166 0 0 1-4-.541zm6 .54v3a20.994 20.994 0 0 0 4-.541v-3a20.994 20.994 0 0 1-4 .541zm6-1.181v3c1.801-.755 3-1.857 3-3.297v-3c0 1.44-1.199 2.542-3 3.297zm-14 3v-3C3.2 13.542 2 12.439 2 11v3c0 1.439 1.2 2.542 3 3.297z'></path></svg><span class='net-cost-value'>${d.net_cost_formatted}</span><div class='cost-label'>Daily net cost<div class='cost-breakdown'><span class='cost-line negative'>- ${d.total_cost_formatted} gear and consumables</span><span class='cost-line positive'>+ ${d.monetary_value_from_scrap_formatted} from scrap</span><span class='cost-line positive'>+ ${d.case_value_formatted} from ${d.cases_per_day_formatted} cases</span>${d.elite_cases_per_day > 0 ? `<span class='cost-line positive'>+ ${d.elite_case_value_formatted} from ${d.elite_cases_per_day_formatted} elite cases</span>` : ''}</div></div></div><span class='card-efficiency'>${efficiencyHtml}</span></div>
                    ${campaignHtml}
                    <div class='card-skills'>
                        <h3>Skills</h3>
                        <div class='skills-grid'>${skillsHtml}</div>
                    </div>
                    <div class='card-items'>
                        <h3>Gear &amp; Consumables</h3>
                        <div class='items-grid'>
                            ${gearHtml}
                            ${d.ammo_name !== 'noAmmo' ? `<div class='gear-item' style='background-color: ${d.ammo_color}'>
                                <img src='static/images/${d.ammo_name}.png' alt='${d.ammo_name}'>
                                <span class='quantity-label'>${d.ammo_quantity}</span>
                            </div>` : ''}
                            ${d.food_name !== 'noFood' ? `<div class='gear-item' style='background-color: ${d.food_color}'>
                                <img src='static/images/${d.food_name}.png' alt='${d.food_name}'>
                                <span class='quantity-label'>${d.food_quantity}</span>
                            </div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join("");
    }

    // --- Render Table ---
    function getSortValue(d, col) {
        if (col === 'damage') return d.total_damage;
        if (col === 'net_cost') return d.net_cost;
        if (col === 'campaign_sustainable') return d.campaign && d.campaign.sustainable ? 1 : 0;
        if (col === 'campaign_remaining') return d.campaign ? d.campaign.remainingBudget : 0;
        if (col === 'campaign_cost') return d.campaign ? d.campaign.warTotalCost : 0;
        if (col === 'eff') return d.net_cost / d.total_damage * 1000;
        if (col === 'ammo') return d.ammo_quantity;
        if (col === 'food') return d.food_quantity;
        if (col.startsWith('skill_')) return d.skill_lvls[parseInt(col.split('_')[1])];
        if (col.startsWith('gear_')) return d.gear[parseInt(col.split('_')[1])].quantity;
        return 0;
    }

    function thHtml(label, col) {
        const active = sortCol === col;
        const arrow = (active && sortDir === -1) ? '▼' : '▲';
        return `<th class="sortable-th${active ? ' sort-active' : ''}" data-sort="${col}">${label}<span class="sort-indicator${active ? ' sort-indicator-visible' : ''}">${arrow}</span></th>`;
    }

    function renderTable(builds) {
        let sorted = [...builds];
        const hasCampaign = sorted.some(d => d.campaign);
        if (sortCol) {
            sorted.sort((a, b) => (getSortValue(a, sortCol) - getSortValue(b, sortCol)) * sortDir);
        }

        const skillCols = SKILL_NAMES.map((n, i) => thHtml(n, `skill_${i}`)).join("");
        const gearHeaders = ['Weapon', 'Helmet', 'Chest', 'Gloves', 'Pants', 'Boots']
            .map((n, i) => thHtml(n, `gear_${i}`)).join("");

        const rows = sorted.map(d => {
            const skillCells = d.skill_lvls.map(lvl => `<td>${lvl}</td>`).join("");
            const gearCells = d.gear.map(g => `<td class="td-gear" style="background-color:${g.color}">${g.tier}<br><small>${(Number(g.quantity)*100).toFixed(0)}%</small></td>`).join("");
            const campaignCells = hasCampaign
                ? `<td class="td-campaign">${d.campaign?.sustainable ? "Yes" : "No"}</td><td class="td-campaign">${d.campaign ? formatMoney(d.campaign.remainingBudget) : "-"}</td>`
                : "";
            const rowClass = `${d.is_recommended ? " recommended-card" : ""}${d.is_highest_damage ? " highest-damage-card" : (d.is_max_damage ? " max-damage-card" : "")}`;
            return `
                <tr class="table-row${rowClass}">
                    <td class="td-damage">${d.total_damage_formatted}</td>
                    <td class="td-cost">${d.net_cost_formatted}</td>
                    ${campaignCells}
                    <td class="td-eff">${(d.net_cost / d.total_damage * 1000).toFixed(2)}</td>
                    ${skillCells}
                    ${gearCells}
                    <td class="td-gear" style="background-color:${d.ammo_color}">${d.ammo_name}<br><small>×${d.ammo_quantity}</small></td>
                    <td class="td-gear" style="background-color:${d.food_color}">${d.food_name}<br><small>×${d.food_quantity}</small></td>
                </tr>`;
        }).join("");

        resultsDiv.innerHTML = `
            <div class="table-wrapper">
                <table class="builds-table">
                    <thead>
                        <tr>
                            ${thHtml('Damage', 'damage')}
                            ${thHtml('Net Cost', 'net_cost')}
                            ${hasCampaign ? `${thHtml('Sustain', 'campaign_sustainable')}${thHtml('Remaining', 'campaign_remaining')}` : ""}
                            ${thHtml('$/K', 'eff')}
                            ${skillCols}
                            ${gearHeaders}
                            ${thHtml('Ammo', 'ammo')}
                            ${thHtml('Food', 'food')}
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;

        resultsDiv.querySelector('.builds-table').addEventListener('click', e => {
            const th = e.target.closest('.sortable-th');
            if (!th) return;
            const col = th.dataset.sort;
            if (sortCol === col) {
                sortDir *= -1;
            } else {
                sortCol = col;
                sortDir = 1;
            }
            renderTable(allBuilds);
        });
    }
});
