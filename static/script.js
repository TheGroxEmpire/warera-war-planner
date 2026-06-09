const SKILL_NAMES = ["Attack", "Precision", "Crit. Chance", "Crit. Dmg", "Armor", "Dodge", "Health", "Hunger", "Loot"];
const STATIC_BASE = String(window.WARERA_STATIC_BASE || "static").replace(/\/$/, "");
const ASSET_BASE = String(window.WARERA_ASSET_BASE || "assets").replace(/\/$/, "");
const ASSET_VERSION = String(window.WARERA_ASSET_VERSION || "");

function staticAsset(path) {
    return `${STATIC_BASE}/${String(path || "").replace(/^\//, "")}`;
}

function itemIconAsset(path) {
    const url = `${ASSET_BASE}/market_item_icons/${String(path || "").replace(/^\//, "")}`;
    return ASSET_VERSION ? `${url}?v=${encodeURIComponent(ASSET_VERSION)}` : url;
}

document.addEventListener("DOMContentLoaded", () => {
    const resultsDiv = document.getElementById("results");
    const campaignResultsDiv = document.getElementById("campaign-results");
    const buildForm = document.getElementById("build-form");
    const optimizeBtns = buildForm.querySelectorAll(".optimize-btn");
    const workersInput = document.getElementById("workers");
    const advancedConfig = document.getElementById("advanced-config");
    const importEcoLinkBtn = document.getElementById("import-eco-link-btn");
    const ecoExportUrlInput = document.getElementById("eco-export-url");
    const ecoImportStatus = document.getElementById("eco-import-status");
    const warSkillSummary = document.getElementById("war-skill-summary");
    const ecoExportImportedInput = document.getElementById("eco_export_imported");
    const importedEcoProfitDay = document.getElementById("imported-eco-profit-day");
    const importedWarProfitDay = document.getElementById("imported-war-profit-day");
    const importedWarSkillPoints = document.getElementById("imported-war-skill-points");
    const importedEconomySummary = document.getElementById("imported-economy-summary");

    updateAdvancedPlaceholders();

    let allBuilds = [];
    let viewMode = 'card';
    let sortCol = null;
    let sortDir = 1;
    let currentObjective = 'damage';
    let hasEcoSimulatorImport = false;
    let importedEcoScenario = null;
    let importedWarScenario = null;

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
        if (!slider || !input) return;

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

        const submitter = event.submitter || buildForm.querySelector(".optimize-btn");
        if (!submitter) return;
        const data = new FormData(buildForm);
        const objective = submitter.value || 'damage';
        data.set('objective', objective);
        data.set('eco_export_imported', hasEcoSimulatorImport ? '1' : '0');
        data.set('eco_profit_day', getFormControlValue('eco_profit_day', '0'));
        data.set('war_profit_day', getFormControlValue('war_profit_day', '0'));
        data.set('eco_days', getFormControlValue('eco_days', '0'));
        data.set('war_days', getFormControlValue('war_days', '1'));
        data.set('stockpiled_money', getFormControlValue('stockpiled_money', '0'));
        data.set('bounty_per_1k_damage', getFormControlValue('bounty_per_1k_damage', '0'));
        [
            'earning_bounty_enabled',
            'earning_battle_loot_enabled',
            'earning_cases_enabled',
            'earning_scrap_enabled',
            'earning_companies_enabled',
        ].forEach((id) => {
            data.set(id, getFormControlChecked(id, true) ? '1' : '0');
        });
        const submitterLabel = submitter.innerHTML;
        currentObjective = objective;

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
            const resultBuilds = campaign.active && Array.isArray(results.all_builds) && results.all_builds.length
                ? results.all_builds
                : (results.builds || []);
            allBuilds = applyCampaignToBuilds(resultBuilds, campaign, objective);
            renderCampaignResults(campaign, allBuilds);

            renderBuilds(allBuilds, objective);

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

    function getFormControl(id) {
        return document.getElementById(id);
    }

    function getFormControlValue(id, fallback = "") {
        const input = getFormControl(id);
        return input ? input.value : fallback;
    }

    function getFormControlChecked(id, fallback = false) {
        const input = getFormControl(id);
        return input ? input.checked : fallback;
    }

    function setFormControlValue(id, value) {
        const input = getFormControl(id);
        if (input && value !== undefined && value !== null) input.value = String(value);
    }

    function setFormControlChecked(id, checked) {
        const input = getFormControl(id);
        if (input) input.checked = Boolean(checked);
    }

    function saveStoredValue(storageKey, inputId) {
        const input = getFormControl(inputId);
        if (input) localStorage.setItem(storageKey, input.value);
    }

    function setInputValue(id, value) {
        const input = getFormControl(id);
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

    function setEcoSimulatorImportState(imported) {
        hasEcoSimulatorImport = Boolean(imported);
        if (ecoExportImportedInput) {
            ecoExportImportedInput.value = hasEcoSimulatorImport ? "1" : "0";
        }
    }

    function importStatusText(imported, restored = false) {
        const userLabel = imported?.war?.user?.username || imported?.eco?.user?.username || "";
        const generatedLabel = imported?.generatedAt ? ` Exported ${new Date(imported.generatedAt).toLocaleString()}.` : "";
        const prefix = restored ? "Restored" : "Imported";
        return `${prefix} ${userLabel ? `${userLabel}'s ` : ""}eco and war factory config.${generatedLabel}`;
    }

    function saveImportedExport(imported) {
        localStorage.setItem("wbt_eco_import_payload", JSON.stringify(imported));
    }

    function restoreImportedExport() {
        const raw = localStorage.getItem("wbt_eco_import_payload");
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            return {
                eco: normalizeScenario(parsed.eco),
                war: normalizeScenario(parsed.war),
                generatedAt: parsed.generatedAt || null,
            };
        } catch {
            return null;
        }
    }

    function applyImportedDerivedFields(imported, dispatchEvents = false) {
        const setValue = dispatchEvents ? setInputValue : setFormControlValue;
        if (imported?.eco) setValue("eco_profit_day", imported.eco.profitDay.toFixed(2));
        if (imported?.war) {
            setValue("war_profit_day", imported.war.profitDay.toFixed(2));
            setValue("reserved_skill_points", imported.war.reservedSkillPoints);
        }
    }

    function updateImportedEconomySummary() {
        const ecoProfitDay = importedEcoScenario ? importedEcoScenario.profitDay : parseNumericInput("eco_profit_day", 0);
        const warProfitDay = importedWarScenario ? importedWarScenario.profitDay : parseNumericInput("war_profit_day", 0);
        const reservedSkillPoints = importedWarScenario ? importedWarScenario.reservedSkillPoints : parseNumericInput("reserved_skill_points", 0);
        if (importedEcoProfitDay) importedEcoProfitDay.textContent = formatMoney(ecoProfitDay);
        if (importedWarProfitDay) importedWarProfitDay.textContent = formatMoney(warProfitDay);
        if (importedWarSkillPoints) importedWarSkillPoints.textContent = String(Math.max(0, Math.floor(reservedSkillPoints)));
        if (importedEconomySummary) importedEconomySummary.classList.toggle("imported", hasEcoSimulatorImport);
    }

    function updateWarSkillSummary(warScenario) {
        if (!hasEcoSimulatorImport) {
            if (warSkillSummary) {
                warSkillSummary.textContent = "Eco profit, war profit, and war eco skill points will be filled from Eco Simulator's War Planner Export.";
                warSkillSummary.classList.remove("imported");
            }
            updateImportedEconomySummary();
            return;
        }
        const reserved = Math.max(0, Math.floor(parseNumericInput("reserved_skill_points", 0)));
        const companiesLevel = warScenario?.skillLevels?.companies || 0;
        const managementLevel = warScenario?.skillLevels?.management || 0;
        const activeCompanies = warScenario?.companiesActive || 0;
        const text = `War eco skills reserve ${reserved} skill points before combat optimization. Companies skill ${companiesLevel}, management skill ${managementLevel}, active war companies ${activeCompanies}.`;
        if (warSkillSummary) {
            warSkillSummary.textContent = text;
            warSkillSummary.classList.toggle("imported", reserved > 0);
        }
        updateImportedEconomySummary();
    }

    async function importEcoSimulatorLink() {
        try {
            const imported = await parseEcoSimulatorExport(getFormControlValue("eco-export-url"));
            if (!imported.eco && !imported.war) {
                throw new Error("The export does not include eco or war scenario data.");
            }

            setEcoSimulatorImportState(true);
            importedEcoScenario = imported.eco || null;
            importedWarScenario = imported.war || null;
            const level = imported.war?.level || imported.eco?.level;
            if (level) setSliderPair("level", level);
            applyImportedDerivedFields(imported, true);

            saveImportedExport(imported);
            saveFormState();
            updateWarSkillSummary(importedWarScenario);

            if (ecoImportStatus) {
                ecoImportStatus.textContent = importStatusText(imported);
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
        const companiesEnabled = getFormControlChecked("earning_companies_enabled", true);
        const bountyEnabled = getFormControlChecked("earning_bounty_enabled", true);
        const battleLootEnabled = getFormControlChecked("earning_battle_loot_enabled", true);
        const warProfitDay = companiesEnabled ? parseNumericInput("war_profit_day", 0) : 0;
        const bountyPer1kDamage = bountyEnabled ? Math.max(0, parseNumericInput("bounty_per_1k_damage", 0)) : 0;
        const battleLootPer1kDamage = battleLootEnabled ? 0.13 : 0;
        const reservedSkillPoints = Math.max(0, Math.floor(parseNumericInput("reserved_skill_points", 0)));
        const stockpiledMoney = Math.max(0, parseNumericInput("stockpiled_money", 0));
        const ecoBudget = ecoProfitDay * ecoDays + stockpiledMoney;
        const warIncome = warProfitDay * warDays;
        const totalBudget = ecoBudget + warIncome;
        return {
            ecoDays,
            warDays,
            ecoProfitDay,
            warProfitDay,
            bountyPer1kDamage,
            battleLootPer1kDamage,
            bountyEnabled,
            battleLootEnabled,
            companiesEnabled,
            reservedSkillPoints,
            stockpiledMoney,
            ecoBudget,
            warIncome,
            totalBudget,
            active: hasEcoSimulatorImport && (ecoDays > 0 || warDays > 0),
        };
    }

    function simulateCampaignBuild(build, campaign) {
        if (window.WareraOptimizer && typeof window.WareraOptimizer.simulateCampaignValues === "function") {
            return window.WareraOptimizer.simulateCampaignValues(
                Number(build.net_cost) || 0,
                Number(build.total_damage) || 0,
                {
                    campaignWarDays: campaign.warDays,
                    campaignInitialStockpile: campaign.ecoBudget,
                    campaignWarProfitDay: campaign.warProfitDay,
                    bountyPer1kDamage: campaign.bountyPer1kDamage,
                    battleLootPer1kDamage: campaign.battleLootPer1kDamage,
                }
            );
        }

        const warDays = Math.max(0, Math.floor(campaign.warDays || 0));
        const dailyNetCost = Number(build.net_cost) || 0;
        const dailyBountyIncome = Math.max(0, Number(build.total_damage || 0) / 1000 * campaign.bountyPer1kDamage);
        const dailyBattleLootIncome = Math.max(0, Number(build.total_damage || 0) / 1000 * campaign.battleLootPer1kDamage);
        let stockpile = Number(campaign.ecoBudget) || 0;
        let sustainable = true;
        let failedDay = null;
        let largestShortfall = 0;
        let lowestStartingBudget = stockpile;
        const dayBudgets = [];

        for (let day = 1; day <= warDays; day += 1) {
            const startingStockpile = stockpile;
            lowestStartingBudget = Math.min(lowestStartingBudget, stockpile);
            const spendShortfall = Math.max(0, dailyNetCost - startingStockpile);
            stockpile = startingStockpile - dailyNetCost + campaign.warProfitDay + dailyBountyIncome + dailyBattleLootIncome;
            const endingShortfall = stockpile < -0.000001 ? -stockpile : 0;
            const shortfall = Math.max(spendShortfall, endingShortfall);
            const overBudget = shortfall > 0.000001;
            if (overBudget) {
                sustainable = false;
                failedDay = failedDay || day;
                largestShortfall = Math.max(largestShortfall, shortfall);
            }
            dayBudgets.push({
                day,
                startingStockpile,
                dailyNetCost,
                dailyIncome: campaign.warProfitDay + dailyBountyIncome + dailyBattleLootIncome,
                endingStockpile: stockpile,
                overBudget,
                shortfall: overBudget ? shortfall : 0,
            });
        }

        const bountyIncome = dailyBountyIncome * warDays;
        const battleLootIncome = dailyBattleLootIncome * warDays;
        const availableBudget = campaign.ecoBudget + campaign.warIncome + bountyIncome + battleLootIncome;
        const warTotalCost = dailyNetCost * warDays;
        const remainingBudget = stockpile;
        const budgetUsagePct = availableBudget > 0 ? (warTotalCost / availableBudget) * 100 : 0;
        return {
            dailyNetCost,
            dailyBountyIncome,
            dailyBattleLootIncome,
            bountyIncome,
            battleLootIncome,
            availableBudget,
            warTotalCost,
            remainingBudget,
            budgetUsagePct,
            sustainable,
            failedDay,
            largestShortfall,
            lowestStartingBudget,
            dayBudgets,
        };
    }

    function buildPrimaryValue(build, objective) {
        const value = build.total_damage;
        return Number.isFinite(Number(value)) ? Number(value) : Number.NEGATIVE_INFINITY;
    }

    function buildCostValue(build) {
        const value = build.campaign ? build.campaign.warTotalCost : build.net_cost;
        return Number.isFinite(Number(value)) ? Number(value) : Number.POSITIVE_INFINITY;
    }

    function filterDominatedBuilds(builds, objective) {
        const epsilon = 0.000001;
        return builds.filter((build, index) => {
            const cost = buildCostValue(build);
            const primary = buildPrimaryValue(build, objective);
            if (!Number.isFinite(cost) || !Number.isFinite(primary)) return true;

            return !builds.some((other, otherIndex) => {
                if (otherIndex === index) return false;
                const otherCost = buildCostValue(other);
                const otherPrimary = buildPrimaryValue(other, objective);
                if (!Number.isFinite(otherCost) || !Number.isFinite(otherPrimary)) return false;

                const noMoreExpensive = otherCost <= cost + epsilon;
                const noLessOutput = otherPrimary >= primary - epsilon;
                const strictlyBetter = otherCost < cost - epsilon || otherPrimary > primary + epsilon;
                return noMoreExpensive && noLessOutput && strictlyBetter;
            });
        });
    }

    function applyCampaignToBuilds(builds, campaign, objective) {
        if (!campaign.active) {
            return filterDominatedBuilds(builds, objective);
        }

        const annotated = builds.map((build) => {
            const simulation = simulateCampaignBuild(build, campaign);
            return {
                ...build,
                is_recommended: false,
                campaign: {
                    warNetCost: simulation.dailyNetCost,
                    warTotalCost: simulation.warTotalCost,
                    bountyIncome: simulation.bountyIncome,
                    battleLootIncome: simulation.battleLootIncome,
                    dailyBountyIncome: simulation.dailyBountyIncome,
                    dailyBattleLootIncome: simulation.dailyBattleLootIncome,
                    availableBudget: simulation.availableBudget,
                    remainingBudget: simulation.remainingBudget,
                    sustainable: simulation.sustainable,
                    budgetUsagePct: simulation.budgetUsagePct,
                    failedDay: simulation.failedDay,
                    largestShortfall: simulation.largestShortfall,
                    lowestStartingBudget: simulation.lowestStartingBudget,
                    dayBudgets: simulation.dayBudgets,
                },
            };
        });

        const metricKey = "total_damage";
        const visibleBuilds = filterDominatedBuilds(
            annotated.filter((build) => build.campaign.budgetUsagePct >= 50),
            objective
        );
        const sustainableBuilds = visibleBuilds.filter((build) => build.campaign.sustainable)
            .sort((a, b) => (b[metricKey] || 0) - (a[metricKey] || 0));
        const unsustainableBuilds = visibleBuilds.filter((build) => !build.campaign.sustainable)
            .sort((a, b) => a.campaign.largestShortfall - b.campaign.largestShortfall || a.campaign.failedDay - b.campaign.failedDay);

        let recommended = null;
        if (sustainableBuilds[0]) {
            recommended = sustainableBuilds[0];
        } else if (unsustainableBuilds[0]) {
            recommended = unsustainableBuilds[0];
        }
        if (recommended) recommended.is_recommended = true;

        return visibleBuilds.sort((a, b) => {
            if (a === recommended) return -1;
            if (b === recommended) return 1;
            return a.campaign.warTotalCost - b.campaign.warTotalCost
                || (b[metricKey] || 0) - (a[metricKey] || 0);
        });
    }

    function maxBountyIncome(builds) {
        return builds.reduce((max, build) => Math.max(max, build.campaign?.bountyIncome || 0), 0);
    }

    function maxBattleLootIncome(builds) {
        return builds.reduce((max, build) => Math.max(max, build.campaign?.battleLootIncome || 0), 0);
    }

    function budgetFailureLabel(campaign) {
        if (!campaign) return "-";
        return campaign.sustainable ? "N/A" : `Day ${campaign.failedDay}`;
    }

    function dailyRewardLines(build) {
        if (!build.campaign) return "";
        const lines = [];
        if (build.campaign.dailyBountyIncome > 0) {
            lines.push(`<span class='cost-line positive'>+ ${formatMoney(build.campaign.dailyBountyIncome)} from bounty</span>`);
        }
        if (build.campaign.dailyBattleLootIncome > 0) {
            lines.push(`<span class='cost-line positive'>+ ${formatMoney(build.campaign.dailyBattleLootIncome)} from battle loot</span>`);
        }
        return lines.join("");
    }

    function effectiveDailyCost(build) {
        if (!build.campaign) return Number(build.net_cost) || 0;
        return (Number(build.campaign.warNetCost) || 0)
            - (Number(build.campaign.dailyBountyIncome) || 0)
            - (Number(build.campaign.dailyBattleLootIncome) || 0);
    }

    function recommendedCampaign(builds) {
        const recommended = builds.find((build) => build.is_recommended) || builds[0];
        return recommended?.campaign || null;
    }

    function renderCampaignResults(campaign, builds) {
        if (!campaignResultsDiv) return;
        if (!campaign.active) {
            campaignResultsDiv.style.display = "none";
            campaignResultsDiv.innerHTML = "";
            return;
        }

        const sustainableCount = builds.filter((build) => build.campaign?.sustainable).length;
        const bountyIncome = maxBountyIncome(builds);
        const battleLootIncome = maxBattleLootIncome(builds);
        const recommended = recommendedCampaign(builds);
        const failureClass = recommended && !recommended.sustainable ? " over-budget" : "";
        campaignResultsDiv.style.display = "";
        campaignResultsDiv.innerHTML = `
            <div class="campaign-results-grid">
                <span><span class="campaign-results-label">Eco Stockpile</span><span class="campaign-results-value">${formatMoney(campaign.ecoBudget)}</span></span>
                <span><span class="campaign-results-label">War Income</span><span class="campaign-results-value">${formatMoney(campaign.warIncome)}</span></span>
                <span><span class="campaign-results-label">Bounty Income</span><span class="campaign-results-value">${formatMoney(bountyIncome)}</span></span>
                <span><span class="campaign-results-label">Battle Loot</span><span class="campaign-results-value">${formatMoney(battleLootIncome)}</span></span>
                <span><span class="campaign-results-label">Simulated Budget</span><span class="campaign-results-value">${formatMoney(campaign.totalBudget + bountyIncome + battleLootIncome)}</span></span>
                <span><span class="campaign-results-label">War Days</span><span class="campaign-results-value">${campaign.warDays}</span></span>
                <span><span class="campaign-results-label">Budget Failure</span><span class="campaign-results-value${failureClass}">${budgetFailureLabel(recommended)}</span></span>
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
                    <span>${formatProgressNumber(evaluated)} / ${formatProgressNumber(total)} checks</span>
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
        [
            ['wbt_level', 'level-input'],
            ['wbt_rank_bonus', 'rank_bonus-input'],
            ['wbt_battle_bonus', 'battle_bonus-input'],
            ['wbt_warera_api_key', 'warera_api_key'],
            ['wbt_workers', 'workers'],
            ['wbt_eco_export_url', 'eco-export-url'],
            ['wbt_eco_days', 'eco_days'],
            ['wbt_war_days', 'war_days'],
            ['wbt_stockpiled_money', 'stockpiled_money'],
            ['wbt_bounty_per_1k_damage', 'bounty_per_1k_damage'],
            ['wbt_eco_profit_day', 'eco_profit_day'],
            ['wbt_war_profit_day', 'war_profit_day'],
            ['wbt_reserved_skill_points', 'reserved_skill_points'],
        ].forEach(([storageKey, inputId]) => saveStoredValue(storageKey, inputId));
        const pillInput = getFormControl('pill');
        if (pillInput) localStorage.setItem('wbt_pill', pillInput.checked);
        [
            ['wbt_earning_bounty_enabled', 'earning_bounty_enabled'],
            ['wbt_earning_battle_loot_enabled', 'earning_battle_loot_enabled'],
            ['wbt_earning_cases_enabled', 'earning_cases_enabled'],
            ['wbt_earning_scrap_enabled', 'earning_scrap_enabled'],
            ['wbt_earning_companies_enabled', 'earning_companies_enabled'],
        ].forEach(([storageKey, inputId]) => {
            const input = getFormControl(inputId);
            if (input) localStorage.setItem(storageKey, input.checked);
        });
        localStorage.setItem('wbt_eco_export_imported', hasEcoSimulatorImport ? 'true' : 'false');
        if (advancedConfig) localStorage.setItem('wbt_advanced_open', advancedConfig.open);
    }

    function restoreFormState() {
        const level = localStorage.getItem('wbt_level');
        if (level) {
            setFormControlValue('level-input', level);
            setFormControlValue('level-slider', level);
        }

        const rankBonus = localStorage.getItem('wbt_rank_bonus');
        if (rankBonus) {
            setFormControlValue('rank_bonus-input', rankBonus);
            setFormControlValue('rank_bonus-slider', rankBonus);
        }

        const battleBonus = localStorage.getItem('wbt_battle_bonus');
        if (battleBonus) {
            setFormControlValue('battle_bonus-input', battleBonus);
            setFormControlValue('battle_bonus-slider', battleBonus);
        }

        const apiKey = localStorage.getItem('wbt_warera_api_key');
        if (apiKey) setFormControlValue('warera_api_key', apiKey);

        const ecoExportUrl = localStorage.getItem('wbt_eco_export_url');
        if (ecoExportUrl) setFormControlValue('eco-export-url', ecoExportUrl);

        const pill = localStorage.getItem('wbt_pill');
        if (pill !== null) setFormControlChecked('pill', pill === 'true');

        [
            ['wbt_earning_bounty_enabled', 'earning_bounty_enabled'],
            ['wbt_earning_battle_loot_enabled', 'earning_battle_loot_enabled'],
            ['wbt_earning_cases_enabled', 'earning_cases_enabled'],
            ['wbt_earning_scrap_enabled', 'earning_scrap_enabled'],
            ['wbt_earning_companies_enabled', 'earning_companies_enabled'],
        ].forEach(([storageKey, inputId]) => {
            const value = localStorage.getItem(storageKey);
            if (value !== null) setFormControlChecked(inputId, value === 'true');
        });

        const campaignFields = [
            ['wbt_eco_days', 'eco_days'],
            ['wbt_war_days', 'war_days'],
            ['wbt_stockpiled_money', 'stockpiled_money'],
            ['wbt_bounty_per_1k_damage', 'bounty_per_1k_damage'],
            ['wbt_eco_profit_day', 'eco_profit_day'],
            ['wbt_war_profit_day', 'war_profit_day'],
            ['wbt_reserved_skill_points', 'reserved_skill_points'],
        ];
        campaignFields.forEach(([storageKey, inputId]) => {
            const value = localStorage.getItem(storageKey);
            const input = getFormControl(inputId);
            if (value !== null && input) input.value = value;
        });
        setEcoSimulatorImportState(localStorage.getItem('wbt_eco_export_imported') === 'true');
        if (hasEcoSimulatorImport) {
            const restoredImport = restoreImportedExport();
            importedEcoScenario = restoredImport?.eco || null;
            importedWarScenario = restoredImport?.war || null;
            applyImportedDerivedFields(restoredImport);
            if (restoredImport && ecoImportStatus) {
                ecoImportStatus.textContent = importStatusText(restoredImport, true);
                ecoImportStatus.classList.add("imported");
            }
        }
        updateImportedEconomySummary();

        const advancedOpen = localStorage.getItem('wbt_advanced_open');
        const shouldRestoreAdvancedOverrides = advancedOpen !== null;

        const workers = localStorage.getItem('wbt_workers');
        if (shouldRestoreAdvancedOverrides && workers && workers !== 'auto') {
            setFormControlValue('workers', workers);
        }

        if (advancedConfig && advancedOpen !== null) advancedConfig.open = advancedOpen === 'true';

        // Re-trigger slider backgrounds after restoring values
        ['level', 'rank_bonus', 'battle_bonus'].forEach(id => {
            const slider = getFormControl(`${id}-slider`);
            if (slider) slider.dispatchEvent(new Event('input'));
        });
    }

    function updateAdvancedPlaceholders() {
        const hardwareConcurrency = navigator.hardwareConcurrency || 4;
        if (workersInput) workersInput.placeholder = `Auto (${hardwareConcurrency})`;
    }

    buildForm.addEventListener('input', saveFormState);
    buildForm.addEventListener('change', saveFormState);
    buildForm.addEventListener('input', updateAdvancedPlaceholders);
    buildForm.addEventListener('input', () => updateWarSkillSummary(importedWarScenario));
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
    updateWarSkillSummary(importedWarScenario);
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
            renderTable(builds, objective);
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
                    <img src='${itemIconAsset(`${g.image_name}.png`)}' alt='${g.slot}'>
                    <span class='quantity-label'>x ${(Number(g.quantity)*100).toFixed(0)} %</span>
                </div>
            `).join("");

            const primaryStatHtml = `${d.total_damage_formatted} DMG<span class='damage-label'>Average daily damage</span>`;
            const displayedDailyCost = effectiveDailyCost(d);
            const efficiencyHtml = `${(displayedDailyCost / d.total_damage * 1000).toFixed(2)} $/K<span class='efficiency-label'>Net cost per 1K damage</span>`;
            const dailyRewardsHtml = dailyRewardLines(d);

            const cardClass = `${d.is_recommended ? " recommended-card" : ""}${d.is_highest_damage ? " highest-damage-card" : (d.is_max_damage ? " max-damage-card" : "")}`;
            const campaignHtml = d.campaign ? `
                    <div class='card-campaign ${d.campaign.sustainable ? "sustainable" : "unsustainable"}'>
                        <h3>${d.is_recommended ? "Recommended Campaign Build" : "Campaign Sustain"}</h3>
                        <div class='campaign-card-grid'>
                            <span><b>${d.campaign.sustainable ? "Sustain" : "Over Budget"}</b><small>Status</small></span>
                            <span><b>${formatMoney(d.campaign.warTotalCost)}</b><small>War net cost</small></span>
                            <span><b>${formatMoney(d.campaign.remainingBudget)}</b><small>Remaining</small></span>
                            <span><b>${Number.isFinite(d.campaign.budgetUsagePct) ? d.campaign.budgetUsagePct.toFixed(1) : "0.0"}%</b><small>Budget used</small></span>
                            <span><b>${formatMoney(d.campaign.bountyIncome)}</b><small>Bounty income</small></span>
                            <span><b>${formatMoney(d.campaign.battleLootIncome)}</b><small>Battle loot</small></span>
                            <span><b class='budget-failure ${d.campaign.sustainable ? "" : "over-budget"}'>${budgetFailureLabel(d.campaign)}</b><small>Budget failure</small></span>
                        </div>
                    </div>
            ` : "";
            return `
                <div class='card${cardClass}'>
                    <div class='card-damage'>${primaryStatHtml}</div>
                    <div class='card-cost'><div class='cost-left'><svg stroke='currentColor' fill='currentColor' stroke-width='0' viewBox='0 0 24 24' height='1em' width='1em' xmlns='http://www.w3.org/2000/svg' style='width: 1em; height: 1em; paint-order: stroke; stroke-linecap: round; stroke-linejoin: round;'><path d='M12 5C7.031 5 2 6.546 2 9.5S7.031 14 12 14c4.97 0 10-1.546 10-4.5S16.97 5 12 5zm-5 9.938v3c1.237.299 2.605.482 4 .541v-3a21.166 21.166 0 0 1-4-.541zm6 .54v3a20.994 20.994 0 0 0 4-.541v-3a20.994 20.994 0 0 1-4 .541zm6-1.181v3c1.801-.755 3-1.857 3-3.297v-3c0 1.44-1.199 2.542-3 3.297zm-14 3v-3C3.2 13.542 2 12.439 2 11v3c0 1.439 1.2 2.542 3 3.297z'></path></svg><span class='net-cost-value'>${formatMoney(displayedDailyCost)}</span><div class='cost-label'>Daily net cost<div class='cost-breakdown'><span class='cost-line negative'>- ${d.total_cost_formatted} gear and consumables</span><span class='cost-line positive'>+ ${d.monetary_value_from_scrap_formatted} from scrap</span><span class='cost-line positive'>+ ${d.case_value_formatted} from ${d.cases_per_day_formatted} cases</span>${d.elite_cases_per_day > 0 ? `<span class='cost-line positive'>+ ${d.elite_case_value_formatted} from ${d.elite_cases_per_day_formatted} elite cases</span>` : ''}${dailyRewardsHtml}</div></div></div><span class='card-efficiency'>${efficiencyHtml}</span></div>
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
                                <img src='${itemIconAsset(`${d.ammo_name}.png`)}' alt='${d.ammo_name}'>
                                <span class='quantity-label'>${d.ammo_quantity}</span>
                            </div>` : ''}
                            ${d.food_name !== 'noFood' ? `<div class='gear-item' style='background-color: ${d.food_color}'>
                                <img src='${itemIconAsset(`${d.food_name}.png`)}' alt='${d.food_name}'>
                                <span class='quantity-label'>${d.food_quantity}</span>
                            </div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join("");
    }

    // --- Render Detailed View ---
    function getSortValue(d, col) {
        if (col === 'damage') return d.total_damage;
        if (col === 'net_cost') return d.net_cost;
        if (col === 'campaign_sustainable') return d.campaign && d.campaign.sustainable ? 1 : 0;
        if (col === 'campaign_failure') return d.campaign && d.campaign.failedDay ? d.campaign.failedDay : Number.MAX_SAFE_INTEGER;
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

    function dailyBudgetHtml(campaign) {
        if (!campaign?.dayBudgets?.length) return "-";
        return `
            <div class="daily-budget-strip">
                ${campaign.dayBudgets.map(day => {
                    const title = `Day ${day.day}: start ${formatMoney(day.startingStockpile)}, spend ${formatMoney(day.dailyNetCost)}, income ${formatMoney(day.dailyIncome)}, end ${formatMoney(day.endingStockpile)}`;
                    return `<span class="daily-budget-chip${day.overBudget ? " over-budget" : ""}" title="${title}"><small>D${day.day}</small>${formatMoney(day.endingStockpile)}</span>`;
                }).join("")}
            </div>
        `;
    }

    function renderTable(builds, objective = 'damage') {
        let sorted = [...builds];
        const hasCampaign = sorted.some(d => d.campaign);
        if (sortCol) {
            sorted.sort((a, b) => (getSortValue(a, sortCol) - getSortValue(b, sortCol)) * sortDir);
        }

        const skillCols = SKILL_NAMES.map((n, i) => thHtml(n, `skill_${i}`)).join("");
        const gearHeaders = ['Weapon', 'Helmet', 'Gloves', 'Chest', 'Pants', 'Boots']
            .map((n, i) => thHtml(n, `gear_${i}`)).join("");

        const rows = sorted.map(d => {
            const skillCells = d.skill_lvls.map(lvl => `<td>${lvl}</td>`).join("");
            const gearCells = d.gear.map(g => `<td class="td-gear" style="background-color:${g.color}">${g.tier}<br><small>${(Number(g.quantity)*100).toFixed(0)}%</small></td>`).join("");
            const campaignCells = hasCampaign
                ? `<td class="td-campaign${d.campaign?.sustainable ? "" : " over-budget"}">${d.campaign?.sustainable ? "Yes" : "No"}</td><td class="td-campaign${d.campaign?.sustainable ? "" : " over-budget"}">${d.campaign ? budgetFailureLabel(d.campaign) : "-"}</td><td class="td-campaign">${d.campaign ? formatMoney(d.campaign.remainingBudget) : "-"}</td><td class="td-campaign td-daily-budget">${dailyBudgetHtml(d.campaign)}</td>`
                : "";
            const rowClass = `${d.is_recommended ? " recommended-card" : ""}${d.is_highest_damage ? " highest-damage-card" : (d.is_max_damage ? " max-damage-card" : "")}`;
            const primaryValue = d.total_damage_formatted;
            const efficiencyValue = (d.net_cost / d.total_damage * 1000).toFixed(2);
            return `
                <tr class="table-row${rowClass}">
                    <td class="td-damage">${primaryValue}</td>
                    <td class="td-cost">${d.net_cost_formatted}</td>
                    ${campaignCells}
                    <td class="td-eff">${efficiencyValue}</td>
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
                            ${hasCampaign ? `${thHtml('Sustain', 'campaign_sustainable')}${thHtml('Budget Failure', 'campaign_failure')}${thHtml('Remaining', 'campaign_remaining')}<th>Daily Stockpile</th>` : ""}
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
            renderTable(allBuilds, currentObjective);
        });
    }
});
