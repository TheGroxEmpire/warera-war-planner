const SKILL_NAMES = ["Attack", "Precision", "Crit. Chance", "Crit. Dmg", "Armor", "Dodge", "Health", "Hunger", "Loot"];
const STATIC_BASE = String(window.WARERA_STATIC_BASE || "static").replace(/\/$/, "");
const ASSET_BASE = String(window.WARERA_ASSET_BASE || "assets").replace(/\/$/, "");
const ASSET_VERSION = String(window.WARERA_ASSET_VERSION || "");
const PIN_CONSTRAINTS_STORAGE_KEY = "wbt_constraints";
const SAVED_SKILL_PINS_STORAGE_KEY = "wbt_saved_skill_sets";
const SAVED_GEAR_PINS_STORAGE_KEY = "wbt_saved_gear_sets";
const ECO_PROFILE_OPTIONS_STORAGE_KEY = "wbt_eco_profile_options_v1";
const RECENT_PROFILE_IMPORT_STORAGE_KEY = "wbt_last_import_profile";

function emptyPinnedConstraints() {
    return {
        skills: Array(9).fill(null),
        gear: Array(6).fill(null),
        ammo: null,
        food: null,
    };
}

function normalizedNullableIndex(value, maxValue) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= maxValue ? parsed : null;
}

function normalizePinnedConstraints(value) {
    const source = value && typeof value === "object" ? value : {};
    const skills = Array.from({ length: 9 }, (_, index) => (
        normalizedNullableIndex(Array.isArray(source.skills) ? source.skills[index] : null, 10)
    ));
    const gear = Array.from({ length: 6 }, (_, index) => (
        normalizedNullableIndex(Array.isArray(source.gear) ? source.gear[index] : null, 6)
    ));
    return {
        skills,
        gear,
        ammo: normalizedNullableIndex(source.ammo, 3),
        food: normalizedNullableIndex(source.food, 3),
    };
}

function normalizeCalculatedScenario(rawScenario) {
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
        employeesActive: Math.max(0, Math.floor(Number(rawScenario.employeesActive) || 0)),
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

function pinnedSkillPointCost(skills) {
    return (Array.isArray(skills) ? skills : []).reduce((total, level) => {
        const normalized = normalizedNullableIndex(level, 10);
        return total + (normalized === null ? 0 : normalized * (normalized + 1) / 2);
    }, 0);
}

function staticAsset(path) {
    return `${STATIC_BASE}/${String(path || "").replace(/^\//, "")}`;
}

function itemIconAsset(path) {
    const url = `${ASSET_BASE}/market_item_icons/${String(path || "").replace(/^\//, "")}`;
    return ASSET_VERSION ? `${url}?v=${encodeURIComponent(ASSET_VERSION)}` : url;
}

function buildPrimaryValue(build, objective) {
    const value = build.total_damage;
    return Number.isFinite(Number(value)) ? Number(value) : Number.NEGATIVE_INFINITY;
}

function buildCostValue(build) {
    const value = build.campaign ? build.campaign.warTotalCost : build.net_cost;
    return Number.isFinite(Number(value)) ? Number(value) : Number.POSITIVE_INFINITY;
}

function effectiveDailyCost(build) {
    if (!build.campaign) return Number(build.net_cost) || 0;
    return (Number(build.campaign.warNetCost) || 0)
        - (Number(build.campaign.dailyBountyIncome) || 0)
        - (Number(build.campaign.dailyBattleLootIncome) || 0);
}

function buildEfficiencyValue(build) {
    const damage = Number(build.total_damage);
    if (!Number.isFinite(damage) || damage <= 0) return Number.POSITIVE_INFINITY;

    const cost = effectiveDailyCost(build);
    return Number.isFinite(cost) ? cost / damage * 1000 : Number.POSITIVE_INFINITY;
}

function campaignAverageDailyDamage(campaignTotalDamage, campaign) {
    const totalDamage = Number(campaignTotalDamage);
    if (!Number.isFinite(totalDamage) || totalDamage <= 0) return 0;

    const ecoDays = Math.max(0, Math.floor(Number(campaign?.ecoDays) || 0));
    const warDays = Math.max(0, Math.floor(Number(campaign?.warDays) || 0));
    const campaignDays = ecoDays + warDays;
    return campaignDays > 0 ? totalDamage / campaignDays : 0;
}

function compareCampaignRecommendationBuilds(a, b, objective) {
    const aSustainable = a.campaign && a.campaign.sustainable ? 1 : 0;
    const bSustainable = b.campaign && b.campaign.sustainable ? 1 : 0;
    return bSustainable - aSustainable
        || buildEfficiencyValue(a) - buildEfficiencyValue(b)
        || buildPrimaryValue(b, objective) - buildPrimaryValue(a, objective)
        || buildCostValue(a) - buildCostValue(b);
}

function compareCampaignRecommendedBuilds(a, b, objective) {
    return buildPrimaryValue(b, objective) - buildPrimaryValue(a, objective)
        || buildCostValue(a) - buildCostValue(b)
        || buildEfficiencyValue(a) - buildEfficiencyValue(b);
}

function selectCampaignRecommendedBuild(builds, objective) {
    const sustainableBuilds = builds.filter((build) => build.campaign && build.campaign.sustainable);
    if (sustainableBuilds.length) {
        return sustainableBuilds.slice().sort((a, b) => compareCampaignRecommendedBuilds(a, b, objective))[0];
    }

    return builds
        .filter((build) => build.campaign)
        .slice()
        .sort((a, b) => compareCampaignRecommendationBuilds(a, b, objective))[0] || null;
}

function canBuildDominate(other, build) {
    if (!build.campaign && !other.campaign) return true;

    const buildSustainable = build.campaign && build.campaign.sustainable;
    const otherSustainable = other.campaign && other.campaign.sustainable;
    return !buildSustainable || otherSustainable;
}

function filterDominatedBuilds(builds, objective) {
    const epsilon = 0.000001;
    return builds.filter((build, index) => {
        const efficiency = buildEfficiencyValue(build);
        const primary = buildPrimaryValue(build, objective);
        if (!Number.isFinite(efficiency) || !Number.isFinite(primary)) return true;

        return !builds.some((other, otherIndex) => {
            if (otherIndex === index) return false;
            if (!canBuildDominate(other, build)) return false;
            const otherEfficiency = buildEfficiencyValue(other);
            const otherPrimary = buildPrimaryValue(other, objective);
            if (!Number.isFinite(otherEfficiency) || !Number.isFinite(otherPrimary)) return false;

            const noLessEfficient = otherEfficiency <= efficiency + epsilon;
            const noLessOutput = otherPrimary >= primary - epsilon;
            const strictlyBetter = otherEfficiency < efficiency - epsilon || otherPrimary > primary + epsilon;
            return noLessEfficient && noLessOutput && strictlyBetter;
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const resultsDiv = document.getElementById("results");
    const campaignResultsDiv = document.getElementById("campaign-results");
    const buildForm = document.getElementById("build-form");
    const apiKeyCard = document.getElementById("warera-api-key-card");
    const apiKeyInput = document.getElementById("warera_api_key");
    const apiKeyStatus = document.getElementById("warera-api-key-status");
    const apiKeySaveBtn = document.getElementById("warera-api-key-save");
    const apiKeyClearBtn = document.getElementById("warera-api-key-clear");
    const apiKeyToggleBtn = document.getElementById("warera-api-key-toggle");
    const optimizeBtns = buildForm.querySelectorAll(".optimize-btn");
    const workersInput = document.getElementById("workers");
    const advancedConfig = document.getElementById("advanced-config");
    const ecoImportStatus = document.getElementById("eco-import-status");
    const warSkillSummary = document.getElementById("war-skill-summary");
    const importedEcoProfitDay = document.getElementById("imported-eco-profit-day");
    const importedWarProfitDay = document.getElementById("imported-war-profit-day");
    const importedWarSkillPoints = document.getElementById("imported-war-skill-points");
    const importedWarProfitDelta = document.getElementById("imported-war-profit-delta");
    const importedActiveCompanies = document.getElementById("imported-active-companies");
    const importedActiveWorkers = document.getElementById("imported-active-workers");
    const importedEconomySummary = document.getElementById("imported-economy-summary");
    const ecoProfileCard = document.getElementById("eco-profile-card");
    const ecoProfileAvatar = document.getElementById("eco-profile-avatar");
    const ecoProfileName = document.getElementById("eco-profile-name");
    const ecoProfileMeta = document.getElementById("eco-profile-meta");
    const refreshEcoProfileBtn = document.getElementById("refresh-eco-profile-btn");
    const warEconomyControls = document.getElementById("war-economy-controls");
    const warCustomSkills = document.getElementById("war-custom-skills");
    const warCompanyCount = document.getElementById("war-company-count");
    const warCompanyList = document.getElementById("war-company-list");
    const warIncludeWorkers = document.getElementById("war-include-workers");
    const constraintsPanel = document.getElementById("constraints-panel");
    const constraintSkillsGrid = document.getElementById("constraint-skills-grid");
    const constraintItemsGrid = document.getElementById("constraint-items-grid");
    const skillPinBudget = document.getElementById("skill-pin-budget");
    const pinStatus = document.getElementById("pin-status");
    const skillPresetControls = document.getElementById("skill-preset-controls");
    const gearPresetControls = document.getElementById("gear-preset-controls");
    const importProfileBtn = document.getElementById("import-profile-btn");
    const profileImportDialog = document.getElementById("profile-import-dialog");
    const profileImportBack = document.getElementById("profile-import-back");
    const profileImportSearchView = document.getElementById("profile-import-search-view");
    const profileImportPreview = document.getElementById("profile-import-preview");
    const profileImportSearch = document.getElementById("profile-import-search");
    const profileImportSearchStatus = document.getElementById("profile-import-search-status");
    const profileImportResults = document.getElementById("profile-import-results");
    const profileImportPinSkills = document.getElementById("profile-import-pin-skills");
    const profileImportPinLoadout = document.getElementById("profile-import-pin-loadout");
    const profileImportSkills = document.getElementById("profile-import-skills");
    const profileImportLoadout = document.getElementById("profile-import-loadout");
    const profileImportLoadoutStatus = document.getElementById("profile-import-loadout-status");
    const profileImportApplyStatus = document.getElementById("profile-import-apply-status");
    const optimizerConstants = window.WareraOptimizer ? window.WareraOptimizer.constants : {};
    const gearSlots = optimizerConstants.GEAR_SLOTS || ["weapon", "helmet", "gloves", "chest", "pants", "boots"];
    const gearTiers = optimizerConstants.GEAR_TIERS || ["none", "grey", "green", "blue", "purple", "gold", "red"];
    const weaponTiers = optimizerConstants.WEAPON_TIERS || ["none", "knife", "gun", "rifle", "sniper", "tank", "jet"];
    const ammoNames = optimizerConstants.AMMO_NAMES || ["noAmmo", "lightAmmo", "ammo", "heavyAmmo"];
    const foodNames = optimizerConstants.FOOD_NAMES || ["noFood", "bread", "steak", "cookedFish"];

    updateAdvancedPlaceholders();

    let allBuilds = [];
    let displayedBuilds = [];
    let viewMode = 'card';
    let sortCol = null;
    let sortDir = 1;
    let currentObjective = 'damage';
    let hasEcoProfile = false;
    let importedEcoScenario = null;
    let importedWarScenario = null;
    let activeEcoProfileEnvelope = null;
    let activeEcoProfileOptions = null;
    let ecoCalculationReady = true;
    let ecoCalculationSequence = 0;
    let pinnedConstraints = loadPinnedConstraints();
    let pinsWithinBudget = true;
    let pinStatusTimer = null;
    let isOptimizing = false;
    let savedSharedApiKey = "";
    let profileImportSearchTimer = null;
    let profileImportSearchController = null;
    let profileImportLoadController = null;
    let profileImportSearchSequence = 0;
    let profileImportMatches = [];
    let selectedImportProfile = null;
    const campaignRecommendationConfig = window.WARERA_CAMPAIGN_RECOMMENDATION_CONFIG || {};
    const campaignRecommendationLimit = Math.max(
        1,
        Math.floor(finiteConfigNumber(campaignRecommendationConfig.limit, Number.MAX_SAFE_INTEGER))
    );
    const campaignRecommendationDamageGap = finiteConfigNumber(campaignRecommendationConfig.damageGapRatio, 0);
    const campaignRecommendationCostGap = finiteConfigNumber(campaignRecommendationConfig.costGapRatio, 0);

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
    buildForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!persistSharedApiKey({ focusWhenMissing: true })) return;
        updatePinBudget();
        if (isOptimizing || !pinsWithinBudget || !ecoCalculationReady) {
            if (!ecoCalculationReady) {
                resultsDiv.innerHTML = '<p class="error">Resolve the war-mode economy error before optimizing.</p>';
            }
            return;
        }

        const submitter = event.submitter || buildForm.querySelector(".optimize-btn");
        if (!submitter) return;
        const data = new FormData(buildForm);
        const objective = submitter.value || 'damage';
        data.set('objective', objective);
        data.set('eco_profile_imported', hasEcoProfile ? '1' : '0');
        data.set('eco_profit_day', getFormControlValue('eco_profit_day', '0'));
        data.set('war_profit_day', getFormControlValue('war_profit_day', '0'));
        data.set('eco_days', getFormControlValue('eco_days', '0'));
        data.set('war_days', getFormControlValue('war_days', '1'));
        data.set('stockpiled_money', getFormControlValue('stockpiled_money', '0'));
        data.set('bounty_per_1k_damage', getFormControlValue('bounty_per_1k_damage', '0'));
        data.set('pinned_skills', JSON.stringify(pinnedConstraints.skills));
        data.set('pinned_gear', JSON.stringify(pinnedConstraints.gear));
        data.set('pinned_ammo', JSON.stringify(pinnedConstraints.ammo));
        data.set('pinned_food', JSON.stringify(pinnedConstraints.food));
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
        isOptimizing = true;
        updateOptimizeButtonState();
        submitter.innerHTML = `<span class="spinner"></span><span>OPTIMIZING</span>`;

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
            const errorMessage = error.message || "An error occurred during optimization. Please try again later.";
            if (/\b(?:401|403)\b|unauthori[sz]ed|invalid api key/i.test(errorMessage)) {
                setApiKeyUi("error", "WarEra rejected this API key. Replace it here once to update both tools.");
            }
            resultsDiv.innerHTML = `<p class="error">${escapeHtml(errorMessage)}</p>`;
        } finally {
            submitter.innerHTML = submitterLabel;
            isOptimizing = false;
            updateOptimizeButtonState();
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

    function formatCompactNumber(value) {
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

    function loadPinnedConstraints() {
        try {
            const stored = localStorage.getItem(PIN_CONSTRAINTS_STORAGE_KEY);
            return stored ? normalizePinnedConstraints(JSON.parse(stored)) : emptyPinnedConstraints();
        } catch (error) {
            console.warn("Could not restore pinned build constraints.", error);
            return emptyPinnedConstraints();
        }
    }

    function persistPinnedConstraints() {
        try {
            localStorage.setItem(PIN_CONSTRAINTS_STORAGE_KEY, JSON.stringify(pinnedConstraints));
        } catch (error) {
            console.warn("Could not save pinned build constraints.", error);
        }
    }

    function itemDisplayName(name) {
        const labels = {
            none: "None",
            noAmmo: "None",
            noFood: "None",
            lightAmmo: "Light Ammo",
            ammo: "Ammo",
            heavyAmmo: "Heavy Ammo",
            cookedFish: "Cooked Fish",
        };
        return labels[name] || String(name).replace(/([a-z])([A-Z])/g, "$1 $2");
    }

    function pinTierColor(name) {
        const colors = {
            grey: "rgb(58, 71, 83)",
            green: "rgb(33, 88, 53)",
            blue: "rgb(27, 54, 114)",
            purple: "rgb(68, 46, 102)",
            gold: "rgb(86, 83, 40)",
            red: "rgb(103, 31, 31)",
            knife: "rgb(58, 71, 83)",
            gun: "rgb(33, 88, 53)",
            rifle: "rgb(27, 54, 114)",
            sniper: "rgb(68, 46, 102)",
            tank: "rgb(86, 83, 40)",
            jet: "rgb(103, 31, 31)",
            lightAmmo: "rgb(33, 88, 53)",
            ammo: "rgb(27, 54, 114)",
            heavyAmmo: "rgb(68, 46, 102)",
            bread: "rgb(33, 88, 53)",
            steak: "rgb(27, 54, 114)",
            cookedFish: "rgb(68, 46, 102)",
        };
        return colors[name] || "";
    }

    function selectOptionsHtml(choices, selectedIndex, anyLabel = "Any") {
        const anySelected = selectedIndex === null ? " selected" : "";
        return `<option value=""${anySelected}>${escapeHtml(anyLabel)}</option>${choices.map((choice, index) => (
            `<option value="${index}"${selectedIndex === index ? " selected" : ""}>${escapeHtml(itemDisplayName(choice))}</option>`
        )).join("")}`;
    }

    function skillPinHtml(index) {
        const selectedLevel = pinnedConstraints.skills[index];
        const levelOptions = Array.from({ length: 11 }, (_, level) => (
            `<option value="${level}"${selectedLevel === level ? " selected" : ""}>Level ${level}</option>`
        )).join("");
        return `
            <label class="pin-slot">
                <span class="pin-slot-label">${escapeHtml(SKILL_NAMES[index])}</span>
                <span class="pin-tile${selectedLevel === null ? "" : " is-pinned"}">
                    <span class="pin-tile-display">
                        <svg aria-hidden="true"><use xlink:href="#skill-svg-${index + 1}"></use></svg>
                        <span class="pin-tile-value">${selectedLevel === null ? "Any" : `Lv ${selectedLevel}`}</span>
                    </span>
                    <select class="pin-select" data-pin-kind="skill" data-pin-index="${index}" aria-label="Pin ${escapeHtml(SKILL_NAMES[index])} level">
                        <option value=""${selectedLevel === null ? " selected" : ""}>Any level</option>
                        ${levelOptions}
                    </select>
                </span>
            </label>`;
    }

    function itemPinDefinitions() {
        const gearDefinitions = gearSlots.map((slot, index) => ({
            kind: "gear",
            index,
            label: slot.charAt(0).toUpperCase() + slot.slice(1),
            choices: index === 0 ? weaponTiers : gearTiers,
            selectedIndex: pinnedConstraints.gear[index],
        }));
        return [
            ...gearDefinitions,
            { kind: "ammo", index: null, label: "Ammo", choices: ammoNames, selectedIndex: pinnedConstraints.ammo },
            { kind: "food", index: null, label: "Food", choices: foodNames, selectedIndex: pinnedConstraints.food },
        ];
    }

    function itemPinImageName(definition, selectedName) {
        if (!selectedName || selectedName === "none" || selectedName === "noAmmo" || selectedName === "noFood") return null;
        if (definition.kind === "gear") return definition.index === 0 ? selectedName : gearSlots[definition.index];
        return selectedName;
    }

    function itemPinHtml(definition) {
        const selectedIndex = definition.selectedIndex;
        const selectedName = selectedIndex === null ? null : definition.choices[selectedIndex];
        const imageName = itemPinImageName(definition, selectedName);
        const displayName = selectedName === null ? "Any" : itemDisplayName(selectedName);
        const color = selectedName ? pinTierColor(selectedName) : "";
        const style = color ? ` style="background-color:${color}"` : "";
        const indexData = definition.index === null ? "" : ` data-pin-index="${definition.index}"`;
        const visual = imageName
            ? `<img src="${itemIconAsset(`${imageName}.png`)}" alt="">`
            : `<span class="pin-empty-icon" aria-hidden="true">${selectedName === null ? "?" : "—"}</span>`;
        return `
            <label class="pin-slot">
                <span class="pin-slot-label">${escapeHtml(definition.label)}</span>
                <span class="pin-tile${selectedIndex === null ? "" : " is-pinned"}"${style}>
                    <span class="pin-tile-display">
                        ${visual}
                        <span class="pin-tile-value">${escapeHtml(displayName)}</span>
                    </span>
                    <select class="pin-select" data-pin-kind="${definition.kind}"${indexData} aria-label="Pin ${escapeHtml(definition.label)}">
                        ${selectOptionsHtml(definition.choices, selectedIndex)}
                    </select>
                </span>
            </label>`;
    }

    function syncPinnedFormFields() {
        setFormControlValue("pinned_skills", JSON.stringify(pinnedConstraints.skills));
        setFormControlValue("pinned_gear", JSON.stringify(pinnedConstraints.gear));
        setFormControlValue("pinned_ammo", JSON.stringify(pinnedConstraints.ammo));
        setFormControlValue("pinned_food", JSON.stringify(pinnedConstraints.food));
    }

    function updateOptimizeButtonState() {
        optimizeBtns.forEach((button) => {
            button.disabled = isOptimizing || !pinsWithinBudget || !ecoCalculationReady;
        });
    }

    function updatePinBudget() {
        const level = Math.max(1, Math.floor(parseNumericInput("level-input", 1)));
        const reservedSkillPoints = Math.max(0, parseNumericInput("reserved_skill_points", 0));
        const availableSkillPoints = Math.max(0, Math.floor(level * 4 - reservedSkillPoints));
        const usedSkillPoints = pinnedSkillPointCost(pinnedConstraints.skills);
        pinsWithinBudget = usedSkillPoints <= availableSkillPoints;
        if (skillPinBudget) {
            skillPinBudget.textContent = `${usedSkillPoints} / ${availableSkillPoints} SP`;
            skillPinBudget.classList.toggle("over", !pinsWithinBudget);
        }
        if (!pinsWithinBudget) {
            showPinStatus(`Pinned skills need ${usedSkillPoints} SP, but only ${availableSkillPoints} SP are available.`, true, false);
        } else if (pinStatus && pinStatus.classList.contains("budget-error")) {
            hidePinStatus();
        }
        if (pinStatus) pinStatus.classList.toggle("budget-error", !pinsWithinBudget);
        updateOptimizeButtonState();
        return pinsWithinBudget;
    }

    function renderPinnedControls() {
        if (constraintSkillsGrid) {
            constraintSkillsGrid.innerHTML = SKILL_NAMES.map((_, index) => skillPinHtml(index)).join("");
        }
        if (constraintItemsGrid) {
            constraintItemsGrid.innerHTML = itemPinDefinitions().map(itemPinHtml).join("");
        }
        syncPinnedFormFields();
        updatePinBudget();
    }

    function showPinStatus(message, isError = false, autoHide = true) {
        if (!pinStatus) return;
        if (pinStatusTimer !== null) {
            clearTimeout(pinStatusTimer);
            pinStatusTimer = null;
        }
        pinStatus.textContent = message;
        pinStatus.classList.add("visible");
        pinStatus.classList.toggle("error", isError);
        if (autoHide) {
            pinStatusTimer = setTimeout(() => {
                hidePinStatus();
            }, 5000);
        }
    }

    function hidePinStatus() {
        if (!pinStatus) return;
        if (pinStatusTimer !== null) clearTimeout(pinStatusTimer);
        pinStatusTimer = null;
        pinStatus.textContent = "";
        pinStatus.classList.remove("visible", "error", "budget-error");
    }

    function applyPinnedConstraints(value, message) {
        pinnedConstraints = normalizePinnedConstraints(value);
        persistPinnedConstraints();
        renderPinnedControls();
        if (message && pinsWithinBudget) showPinStatus(message);
    }

    function updatePinFromSelect(select) {
        const value = select.value === "" ? null : Number.parseInt(select.value, 10);
        const kind = select.dataset.pinKind;
        const index = Number.parseInt(select.dataset.pinIndex, 10);
        if (kind === "skill") pinnedConstraints.skills[index] = normalizedNullableIndex(value, 10);
        if (kind === "gear") pinnedConstraints.gear[index] = normalizedNullableIndex(value, 6);
        if (kind === "ammo") pinnedConstraints.ammo = normalizedNullableIndex(value, 3);
        if (kind === "food") pinnedConstraints.food = normalizedNullableIndex(value, 3);
        persistPinnedConstraints();
        renderPinnedControls();
    }

    function loadSavedPinSets(kind) {
        const storageKey = kind === "skill" ? SAVED_SKILL_PINS_STORAGE_KEY : SAVED_GEAR_PINS_STORAGE_KEY;
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
            if (!Array.isArray(parsed)) return [];
            return parsed.filter((entry) => entry && typeof entry.name === "string").map((entry) => {
                if (kind === "skill") {
                    return { name: entry.name, skills: normalizePinnedConstraints({ skills: entry.skills }).skills };
                }
                const normalized = normalizePinnedConstraints(entry);
                return { name: entry.name, gear: normalized.gear, ammo: normalized.ammo, food: normalized.food };
            });
        } catch (error) {
            console.warn(`Could not restore saved ${kind} pin sets.`, error);
            return [];
        }
    }

    function savePinSets(kind, sets) {
        const storageKey = kind === "skill" ? SAVED_SKILL_PINS_STORAGE_KEY : SAVED_GEAR_PINS_STORAGE_KEY;
        try {
            localStorage.setItem(storageKey, JSON.stringify(sets));
        } catch (error) {
            console.warn(`Could not save ${kind} pin sets.`, error);
        }
    }

    function renderPresetControls(kind) {
        const container = kind === "skill" ? skillPresetControls : gearPresetControls;
        if (!container) return;
        const sets = loadSavedPinSets(kind);
        const noun = kind === "skill" ? "Skills" : "Gear";
        container.innerHTML = `
            <button type="button" data-preset-action="save" title="Save the current ${noun.toLowerCase()} pins">Save ${noun}</button>
            ${sets.length ? `
                <select data-preset-action="load" aria-label="Load saved ${noun.toLowerCase()} pins">
                    <option value="">Load set…</option>
                    ${sets.map((set, index) => `<option value="${index}">${escapeHtml(set.name)}</option>`).join("")}
                </select>
                <button type="button" class="pin-preset-delete" data-preset-action="delete" title="Delete selected set" aria-label="Delete selected ${noun.toLowerCase()} set">✕</button>
            ` : ""}`;
    }

    function bindPresetControls(container, kind) {
        if (!container) return;
        container.addEventListener("change", (event) => {
            const select = event.target.closest('[data-preset-action="load"]');
            if (!select || select.value === "") return;
            const set = loadSavedPinSets(kind)[Number.parseInt(select.value, 10)];
            if (!set) return;
            if (kind === "skill") {
                applyPinnedConstraints({ ...pinnedConstraints, skills: set.skills }, `Loaded skill set “${set.name}”.`);
            } else {
                applyPinnedConstraints({ ...pinnedConstraints, gear: set.gear, ammo: set.ammo, food: set.food }, `Loaded gear set “${set.name}”.`);
            }
        });
        container.addEventListener("click", (event) => {
            const action = event.target.closest("[data-preset-action]")?.dataset.presetAction;
            if (action === "save") {
                const name = window.prompt(`Name this ${kind} set:`);
                if (!name || !name.trim()) return;
                const sets = loadSavedPinSets(kind);
                sets.push(kind === "skill"
                    ? { name: name.trim(), skills: pinnedConstraints.skills.slice() }
                    : { name: name.trim(), gear: pinnedConstraints.gear.slice(), ammo: pinnedConstraints.ammo, food: pinnedConstraints.food });
                savePinSets(kind, sets);
                renderPresetControls(kind);
                showPinStatus(`Saved ${kind} set “${name.trim()}”.`);
            }
            if (action === "delete") {
                const select = container.querySelector('[data-preset-action="load"]');
                if (!select || select.value === "") return;
                const index = Number.parseInt(select.value, 10);
                const sets = loadSavedPinSets(kind);
                const set = sets[index];
                if (!set || !window.confirm(`Delete ${kind} set “${set.name}”?`)) return;
                sets.splice(index, 1);
                savePinSets(kind, sets);
                renderPresetControls(kind);
                showPinStatus(`Deleted ${kind} set “${set.name}”.`);
            }
        });
    }

    function pinFullBuild(build) {
        if (!build) return;
        applyPinnedConstraints({
            skills: build.skill_lvls,
            gear: build.gear_idx,
            ammo: build.ammo_idx,
            food: build.food_idx,
        }, "Pinned the full build. Change any locked slot, then optimize again.");
        if (constraintsPanel && typeof constraintsPanel.scrollIntoView === "function") {
            constraintsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }

    function initializePinnedControls() {
        renderPinnedControls();
        renderPresetControls("skill");
        renderPresetControls("gear");
        constraintSkillsGrid?.addEventListener("change", (event) => {
            const select = event.target.closest(".pin-select");
            if (select) updatePinFromSelect(select);
        });
        constraintItemsGrid?.addEventListener("change", (event) => {
            const select = event.target.closest(".pin-select");
            if (select) updatePinFromSelect(select);
        });
        document.getElementById("reset-skill-pins")?.addEventListener("click", () => {
            applyPinnedConstraints({ ...pinnedConstraints, skills: Array(9).fill(null) }, "All skill pins reset to Any.");
        });
        document.getElementById("reset-gear-pins")?.addEventListener("click", () => {
            applyPinnedConstraints({ ...pinnedConstraints, gear: Array(6).fill(null), ammo: null, food: null }, "All gear and consumable pins reset to Any.");
        });
        bindPresetControls(skillPresetControls, "skill");
        bindPresetControls(gearPresetControls, "gear");
        resultsDiv.addEventListener("click", (event) => {
            const button = event.target.closest(".pin-full-build-btn");
            if (!button) return;
            pinFullBuild(displayedBuilds[Number.parseInt(button.dataset.buildIndex, 10)]);
        });
    }

    function profileImportAdapter() {
        if (!window.WareraProfileImport) {
            throw new Error("The WarEra profile importer did not load. Refresh the page and try again.");
        }
        return window.WareraProfileImport;
    }

    function profileImportApiOptions(signal) {
        return {
            apiKey: String(getFormControlValue("warera_api_key", "") || "").trim(),
            signal,
        };
    }

    function safeAvatarUrl(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        try {
            const url = new URL(raw);
            return ["http:", "https:"].includes(url.protocol) ? url.href : "";
        } catch (error) {
            return "";
        }
    }

    function normalizeRecentProfileImport(value) {
        if (!value || typeof value !== "object") return null;
        const id = String(value.id || "").trim();
        const username = String(value.username || "").trim();
        const level = Math.min(50, Math.max(1, Math.floor(Number(value.level) || 1)));
        if (!id || !username) return null;
        return {
            id,
            username,
            level,
            avatarUrl: safeAvatarUrl(value.avatarUrl),
        };
    }

    function readRecentProfileImport() {
        try {
            return normalizeRecentProfileImport(JSON.parse(
                localStorage.getItem(RECENT_PROFILE_IMPORT_STORAGE_KEY) || "null",
            ));
        } catch (error) {
            console.warn("Could not restore the recent profile import.", error);
            return null;
        }
    }

    function saveRecentProfileImport(profile) {
        const recent = normalizeRecentProfileImport(profile);
        if (!recent) return;
        try {
            localStorage.setItem(RECENT_PROFILE_IMPORT_STORAGE_KEY, JSON.stringify(recent));
        } catch (error) {
            console.warn("Could not save the recent profile import.", error);
        }
    }

    function profileImportResultHtml(player) {
        const avatarUrl = safeAvatarUrl(player.avatarUrl);
        const fallback = escapeHtml(player.username.trim().charAt(0).toUpperCase() || "?");
        const avatar = avatarUrl
            ? `<img class="profile-import-result-avatar" src="${escapeHtml(avatarUrl)}" alt=""><span class="profile-import-result-placeholder" aria-hidden="true" hidden>${fallback}</span>`
            : `<span class="profile-import-result-placeholder" aria-hidden="true">${fallback}</span>`;
        return `<button type="button" class="profile-import-result" data-profile-id="${escapeHtml(player.id)}">
            ${avatar}
            <span class="profile-import-result-name">${escapeHtml(player.username)}</span>
            <span class="profile-import-result-level">Lvl ${player.level}</span>
        </button>`;
    }

    function bindProfileImportAvatarFallbacks() {
        profileImportResults?.querySelectorAll(".profile-import-result-avatar").forEach((avatar) => {
            avatar.addEventListener("error", () => {
                avatar.hidden = true;
                avatar.nextElementSibling?.removeAttribute("hidden");
                avatar.removeAttribute("src");
            }, { once: true });
        });
    }

    function setProfileImportStatus(element, message, isError = false) {
        if (!element) return;
        element.textContent = message || "";
        element.hidden = !message;
        element.classList.toggle("profile-import-error", Boolean(isError));
    }

    function showRecentProfileImport() {
        if (!profileImportResults) return;
        const recent = readRecentProfileImport();
        profileImportMatches = recent ? [recent] : [];
        profileImportResults.innerHTML = recent
            ? `<p class="profile-import-recent-label">Recent</p>${profileImportResultHtml(recent)}`
            : "";
        bindProfileImportAvatarFallbacks();
    }

    function cancelProfileImportRequests() {
        if (profileImportSearchTimer !== null) clearTimeout(profileImportSearchTimer);
        profileImportSearchTimer = null;
        profileImportSearchController?.abort();
        profileImportLoadController?.abort();
        profileImportSearchController = null;
        profileImportLoadController = null;
        profileImportSearchSequence += 1;
    }

    function closeProfileImportDialog() {
        cancelProfileImportRequests();
        if (!profileImportDialog) return;
        if (typeof profileImportDialog.close === "function" && profileImportDialog.open) {
            profileImportDialog.close();
        } else {
            profileImportDialog.removeAttribute("open");
        }
    }

    function showProfileImportSearch() {
        selectedImportProfile = null;
        if (profileImportSearchView) profileImportSearchView.hidden = false;
        if (profileImportPreview) profileImportPreview.hidden = true;
        if (profileImportBack) profileImportBack.hidden = true;
        if (profileImportPinSkills) {
            profileImportPinSkills.checked = false;
            profileImportPinSkills.disabled = false;
        }
        if (profileImportPinLoadout) {
            profileImportPinLoadout.checked = false;
            profileImportPinLoadout.disabled = false;
        }
        if (profileImportSkills) profileImportSkills.hidden = true;
        if (profileImportLoadout) profileImportLoadout.hidden = true;
        setProfileImportStatus(profileImportApplyStatus, "");
        setProfileImportStatus(profileImportLoadoutStatus, "");
    }

    function openProfileImportDialog() {
        try {
            profileImportAdapter();
        } catch (error) {
            showPinStatus(error.message, true);
            return;
        }
        cancelProfileImportRequests();
        showProfileImportSearch();
        if (profileImportSearch) profileImportSearch.value = "";
        setProfileImportStatus(profileImportSearchStatus, "Type at least 2 characters to search.");
        showRecentProfileImport();
        if (!profileImportDialog) return;
        if (typeof profileImportDialog.showModal === "function") {
            if (!profileImportDialog.open) profileImportDialog.showModal();
        } else {
            profileImportDialog.setAttribute("open", "");
        }
        window.setTimeout(() => profileImportSearch?.focus(), 0);
    }

    async function performProfileImportSearch(query, sequence) {
        const controller = new AbortController();
        profileImportSearchController = controller;
        try {
            const matches = await profileImportAdapter().searchUsers(
                query,
                profileImportApiOptions(controller.signal),
            );
            if (sequence !== profileImportSearchSequence || controller.signal.aborted) return;
            profileImportMatches = matches;
            if (profileImportResults) {
                profileImportResults.innerHTML = matches.map(profileImportResultHtml).join("");
                bindProfileImportAvatarFallbacks();
            }
            setProfileImportStatus(
                profileImportSearchStatus,
                matches.length
                    ? `${matches.length} player${matches.length === 1 ? "" : "s"} found.`
                    : `No players found for “${query}”.`,
            );
        } catch (error) {
            if (error?.name === "AbortError" || sequence !== profileImportSearchSequence) return;
            profileImportMatches = [];
            if (profileImportResults) profileImportResults.innerHTML = "";
            setProfileImportStatus(
                profileImportSearchStatus,
                error.message || "Could not search WarEra profiles.",
                true,
            );
        } finally {
            if (profileImportSearchController === controller) profileImportSearchController = null;
        }
    }

    function queueProfileImportSearch() {
        if (profileImportSearchTimer !== null) clearTimeout(profileImportSearchTimer);
        profileImportSearchTimer = null;
        profileImportSearchController?.abort();
        profileImportSearchController = null;
        profileImportLoadController?.abort();
        profileImportLoadController = null;
        const sequence = ++profileImportSearchSequence;
        const query = String(profileImportSearch?.value || "").trim();
        if (query.length < 2) {
            if (!query) showRecentProfileImport();
            else {
                profileImportMatches = [];
                if (profileImportResults) profileImportResults.innerHTML = "";
            }
            setProfileImportStatus(profileImportSearchStatus, "Type at least 2 characters to search.");
            return;
        }
        profileImportMatches = [];
        if (profileImportResults) profileImportResults.innerHTML = "";
        setProfileImportStatus(profileImportSearchStatus, "Searching WarEra…");
        profileImportSearchTimer = window.setTimeout(() => {
            profileImportSearchTimer = null;
            performProfileImportSearch(query, sequence);
        }, 300);
    }

    function profileImportSkillPreview(profile) {
        return SKILL_NAMES.map((name, index) => `<div class="profile-import-skill">
            <small title="${escapeHtml(name)}">${escapeHtml(name)}</small>
            <div class="profile-import-skill-visual">
                <svg aria-hidden="true"><use xlink:href="#skill-svg-${index + 1}"></use></svg>
                <span>Lv ${profile.skillLevels[index]}</span>
            </div>
        </div>`).join("");
    }

    function profileImportLoadoutPreview(profile) {
        const definitions = [
            ...gearSlots.map((slot, index) => ({
                label: slot.charAt(0).toUpperCase() + slot.slice(1),
                index: profile.gearTiers[index],
                choices: index === 0 ? weaponTiers : gearTiers,
                image: (name) => index === 0 ? name : slot,
            })),
            {
                label: "Ammo",
                index: profile.ammoIndex,
                choices: ammoNames,
                image: (name) => name,
            },
        ];
        return definitions.map((definition) => {
            const selectedName = definition.index === null ? null : definition.choices[definition.index];
            const hasItem = selectedName && !["none", "noAmmo"].includes(selectedName);
            const color = selectedName ? pinTierColor(selectedName) : "";
            const style = color ? ` style="background-color:${color}"` : "";
            const visual = hasItem
                ? `<img src="${itemIconAsset(`${definition.image(selectedName)}.png`)}" alt="">`
                : `<span aria-hidden="true">—</span>`;
            const value = selectedName === null ? "Unknown · unchanged" : itemDisplayName(selectedName);
            return `<div class="profile-import-item">
                <small title="${escapeHtml(definition.label)}">${escapeHtml(definition.label)}</small>
                <div class="profile-import-item-visual${hasItem ? "" : " is-unknown"}"${style}>${visual}</div>
                <small title="${escapeHtml(value)}">${escapeHtml(value)}</small>
            </div>`;
        }).join("");
    }

    function updateProfileImportPreviewVisibility() {
        if (profileImportSkills) profileImportSkills.hidden = !profileImportPinSkills?.checked;
        if (profileImportLoadout) profileImportLoadout.hidden = !profileImportPinLoadout?.checked;
    }

    function renderProfileImportPreview(profile, searchMatch) {
        selectedImportProfile = profile;
        if (profileImportSearchView) profileImportSearchView.hidden = true;
        if (profileImportPreview) profileImportPreview.hidden = false;
        if (profileImportBack) profileImportBack.hidden = false;
        const username = document.getElementById("profile-import-username");
        const levelBadge = document.getElementById("profile-import-level-badge");
        const level = document.getElementById("profile-import-level");
        const rank = document.getElementById("profile-import-rank");
        if (username) username.textContent = profile.username;
        if (levelBadge) levelBadge.textContent = `Level ${profile.level}`;
        if (level) level.textContent = String(profile.level);
        if (rank) rank.textContent = `${Number(profile.rankBonusPct.toFixed(2))}%`;

        const avatar = document.getElementById("profile-import-avatar");
        const avatarPlaceholder = document.getElementById("profile-import-avatar-placeholder");
        const avatarUrl = safeAvatarUrl(profile.avatarUrl || searchMatch?.avatarUrl);
        if (avatar && avatarPlaceholder) {
            avatar.hidden = !avatarUrl;
            avatarPlaceholder.hidden = Boolean(avatarUrl);
            avatarPlaceholder.textContent = profile.username.trim().charAt(0).toUpperCase() || "?";
            avatar.onerror = () => {
                avatar.hidden = true;
                avatarPlaceholder.hidden = false;
            };
            if (avatarUrl) avatar.src = avatarUrl;
            else avatar.removeAttribute("src");
        }

        if (profileImportSkills) profileImportSkills.innerHTML = profileImportSkillPreview(profile);
        if (profileImportLoadout) profileImportLoadout.innerHTML = profileImportLoadoutPreview(profile);
        if (profileImportPinSkills) {
            profileImportPinSkills.checked = false;
            profileImportPinSkills.disabled = !profile.skillsAvailable;
        }
        if (profileImportPinLoadout) {
            profileImportPinLoadout.checked = false;
            profileImportPinLoadout.disabled = !profile.loadoutAvailable;
        }
        const loadoutMessage = profile.loadoutError
            || (profile.loadoutWarnings?.length
                ? `${profile.loadoutWarnings.join(", ")}. Those pins will stay unchanged.`
                : "");
        setProfileImportStatus(profileImportLoadoutStatus, loadoutMessage, Boolean(loadoutMessage));
        setProfileImportStatus(profileImportApplyStatus, profile.skillsError || "", Boolean(profile.skillsError));
        updateProfileImportPreviewVisibility();
        profileImportBack?.focus();
    }

    async function selectProfileImportResult(userId) {
        const searchMatch = profileImportMatches.find((entry) => entry.id === userId) || null;
        profileImportLoadController?.abort();
        const controller = new AbortController();
        profileImportLoadController = controller;
        setProfileImportStatus(
            profileImportSearchStatus,
            `Loading ${searchMatch?.username || "player"}…`,
        );
        try {
            const profile = await profileImportAdapter().loadProfile(
                userId,
                profileImportApiOptions(controller.signal),
            );
            if (controller.signal.aborted) return;
            renderProfileImportPreview(profile, searchMatch);
        } catch (error) {
            if (controller.signal.aborted
                || profileImportLoadController !== controller
                || error?.name === "AbortError") return;
            setProfileImportStatus(
                profileImportSearchStatus,
                error.message || "Could not load that WarEra profile.",
                true,
            );
        } finally {
            if (profileImportLoadController === controller) profileImportLoadController = null;
        }
    }

    function applySelectedProfileImport() {
        if (!selectedImportProfile) return;
        const pinSkills = Boolean(profileImportPinSkills?.checked);
        const pinLoadout = Boolean(profileImportPinLoadout?.checked);
        if (pinSkills && !selectedImportProfile.skillsAvailable) {
            setProfileImportStatus(profileImportApplyStatus, selectedImportProfile.skillsError, true);
            return;
        }
        if (pinLoadout && !selectedImportProfile.loadoutAvailable) {
            setProfileImportStatus(profileImportApplyStatus, selectedImportProfile.loadoutError, true);
            return;
        }

        setSliderPair("level", selectedImportProfile.level);
        setSliderPair("rank_bonus", selectedImportProfile.rankBonusPct);
        const importedParts = [];
        if (pinSkills) importedParts.push("current skills");
        if (pinLoadout) importedParts.push("equipped loadout");
        const message = `Imported ${selectedImportProfile.username}’s level and rank${
            importedParts.length ? `, plus ${importedParts.join(" and ")}` : ""
        }.`;
        if (pinSkills || pinLoadout) {
            const nextConstraints = profileImportAdapter().buildImportedConstraints(
                pinnedConstraints,
                selectedImportProfile,
                { pinSkills, pinLoadout },
            );
            applyPinnedConstraints(nextConstraints, message);
        } else {
            updatePinBudget();
            if (pinsWithinBudget) showPinStatus(message);
        }
        saveRecentProfileImport({
            id: selectedImportProfile.id,
            username: selectedImportProfile.username,
            avatarUrl: selectedImportProfile.avatarUrl,
            level: selectedImportProfile.level,
        });
        saveFormState();
        closeProfileImportDialog();
    }

    function initializeProfileImport() {
        if (!importProfileBtn || !profileImportDialog) return;
        importProfileBtn.addEventListener("click", openProfileImportDialog);
        profileImportSearch?.addEventListener("input", queueProfileImportSearch);
        profileImportResults?.addEventListener("click", (event) => {
            const result = event.target.closest("[data-profile-id]");
            if (result) selectProfileImportResult(result.dataset.profileId);
        });
        profileImportPinSkills?.addEventListener("change", updateProfileImportPreviewVisibility);
        profileImportPinLoadout?.addEventListener("change", updateProfileImportPreviewVisibility);
        profileImportBack?.addEventListener("click", () => {
            profileImportLoadController?.abort();
            if (profileImportSearch) profileImportSearch.value = "";
            showProfileImportSearch();
            setProfileImportStatus(profileImportSearchStatus, "Type at least 2 characters to search.");
            showRecentProfileImport();
            profileImportSearch?.focus();
        });
        document.getElementById("profile-import-close")?.addEventListener("click", closeProfileImportDialog);
        document.getElementById("profile-import-cancel")?.addEventListener("click", closeProfileImportDialog);
        document.getElementById("profile-import-apply")?.addEventListener("click", applySelectedProfileImport);
        profileImportDialog.addEventListener("close", cancelProfileImportRequests);
        profileImportDialog.addEventListener("click", (event) => {
            if (event.target !== profileImportDialog) return;
            const rect = profileImportDialog.getBoundingClientRect();
            const inside = event.clientX >= rect.left && event.clientX <= rect.right
                && event.clientY >= rect.top && event.clientY <= rect.bottom;
            if (!inside) closeProfileImportDialog();
        });
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

    function setEcoProfileState(imported) {
        hasEcoProfile = Boolean(imported);
    }

    function ecoProfileEngine() {
        if (!window.WareraEcoEngine) {
            throw new Error("The economy profile adapter did not load. Refresh the page and try again.");
        }
        return window.WareraEcoEngine;
    }

    function profileOptionDefaults(profile) {
        const companyCapacity = Math.min(profile.companyConfigs.length, 2 + profile.alloc.companies);
        return {
            signature: activeEcoProfileEnvelope?.generatedAt || profile.savedAt || "",
            mode: "minimum",
            companyCount: companyCapacity,
            activeCompanyIds: profile.companyConfigs.slice(0, companyCapacity).map((company) => company.id),
            includeWorkers: true,
            customSkills: { ...profile.alloc },
        };
    }

    function restoreEcoProfileOptions(profile) {
        const defaults = profileOptionDefaults(profile);
        try {
            const parsed = JSON.parse(localStorage.getItem(ECO_PROFILE_OPTIONS_STORAGE_KEY) || "null");
            if (!parsed || parsed.signature !== defaults.signature) return defaults;
            const knownIds = new Set(profile.companyConfigs.map((company) => company.id));
            const selectedIds = Array.isArray(parsed.activeCompanyIds)
                ? parsed.activeCompanyIds.map(Number).filter((id, index, values) => knownIds.has(id) && values.indexOf(id) === index)
                : defaults.activeCompanyIds;
            return {
                signature: defaults.signature,
                mode: ["minimum", "current", "custom"].includes(parsed.mode) ? parsed.mode : defaults.mode,
                companyCount: selectedIds.length,
                activeCompanyIds: selectedIds,
                includeWorkers: parsed.includeWorkers !== false,
                customSkills: Object.fromEntries(ecoProfileEngine().SKILL_KEYS.map((key) => [
                    key,
                    Math.min(10, Math.max(0, Math.floor(Number(parsed.customSkills?.[key] ?? profile.alloc[key]) || 0))),
                ])),
            };
        } catch (error) {
            console.warn("Could not restore war economy controls.", error);
            return defaults;
        }
    }

    function selectedWarCompanyIds() {
        if (!warCompanyList) return [];
        return Array.from(warCompanyList.querySelectorAll('input[type="checkbox"]:checked'))
            .map((input) => Number(input.value))
            .filter(Number.isFinite);
    }

    function currentWarEcoMode() {
        return buildForm.querySelector('input[name="war_eco_mode"]:checked')?.value || "minimum";
    }

    function readEcoProfileOptions() {
        const profile = activeEcoProfileEnvelope?.profile;
        if (!profile) return null;
        const customSkills = Object.fromEntries(ecoProfileEngine().SKILL_KEYS.map((key) => [
            key,
            parseNumericInput(`war-skill-${key}`, profile.alloc[key]),
        ]));
        const activeCompanyIds = selectedWarCompanyIds();
        return {
            signature: activeEcoProfileEnvelope.generatedAt || profile.savedAt || "",
            mode: currentWarEcoMode(),
            companyCount: activeCompanyIds.length,
            activeCompanyIds,
            includeWorkers: getFormControlChecked("war-include-workers", true),
            customSkills,
        };
    }

    function persistEcoProfileOptions(options) {
        if (!options) return;
        try {
            localStorage.setItem(ECO_PROFILE_OPTIONS_STORAGE_KEY, JSON.stringify(options));
        } catch (error) {
            console.warn("Could not save war economy controls.", error);
        }
    }

    function humanizeMaterial(value) {
        return String(value || "company").replace(/_/g, " ");
    }

    function renderWarCompanyChoices(profile, selectedIds) {
        if (!warCompanyList) return;
        const selected = new Set(selectedIds.map(Number));
        warCompanyList.innerHTML = profile.companyConfigs.map((company, index) => {
            const workerCount = Array.isArray(company.workers) ? company.workers.length : 0;
            return `<label class="war-company-option">
                <input type="checkbox" value="${company.id}"${selected.has(company.id) ? " checked" : ""}>
                <span><b>${escapeHtml(humanizeMaterial(company.specialization))} #${index + 1}</b><small>AE ${company.aeLevel} · ${workerCount} worker${workerCount === 1 ? "" : "s"}</small></span>
            </label>`;
        }).join("");
    }

    function applyEcoProfileOptionsToControls(profile, options) {
        const modeInput = buildForm.querySelector(`input[name="war_eco_mode"][value="${options.mode}"]`);
        if (modeInput) modeInput.checked = true;
        setFormControlChecked("war-include-workers", options.includeWorkers);
        for (const key of ecoProfileEngine().SKILL_KEYS) {
            setFormControlValue(`war-skill-${key}`, options.customSkills[key]);
        }
        renderWarCompanyChoices(profile, options.activeCompanyIds);
        if (warCompanyCount) {
            warCompanyCount.max = String(profile.companyConfigs.length);
            warCompanyCount.value = String(options.activeCompanyIds.length);
        }
        updateWarModeControlVisibility();
    }

    function updateWarModeControlVisibility() {
        if (warCustomSkills) warCustomSkills.hidden = currentWarEcoMode() !== "custom";
    }

    function applyRequestedCompanyCount() {
        if (!warCompanyList || !activeEcoProfileEnvelope) return;
        const checkboxes = Array.from(warCompanyList.querySelectorAll('input[type="checkbox"]'));
        const requested = Math.min(checkboxes.length, Math.max(0, Math.floor(parseNumericInput("war-company-count", 0))));
        let selected = checkboxes.filter((input) => input.checked);
        if (selected.length > requested) {
            selected.slice(requested).forEach((input) => { input.checked = false; });
        } else if (selected.length < requested) {
            for (const input of checkboxes) {
                if (!input.checked) {
                    input.checked = true;
                    selected.push(input);
                }
                if (selected.length >= requested) break;
            }
        }
        if (warCompanyCount) warCompanyCount.value = String(selectedWarCompanyIds().length);
    }

    function formatProfileDate(value) {
        if (!value) return "";
        const date = new Date(value);
        return Number.isFinite(date.getTime()) ? date.toLocaleString() : "";
    }

    function renderEcoProfileCard(envelope) {
        const profile = envelope.profile;
        const username = profile.importMeta?.user?.username || "Economy profile";
        const workerCount = profile.companyConfigs.reduce((sum, company) => sum + company.workers.length, 0);
        const priceTime = profile.syncMeta?.pricesSyncedAt || profile.savedAt || envelope.generatedAt;
        if (ecoProfileCard) ecoProfileCard.hidden = false;
        if (warEconomyControls) warEconomyControls.hidden = false;
        if (ecoProfileName) ecoProfileName.textContent = username;
        if (ecoProfileAvatar) ecoProfileAvatar.textContent = username.trim().charAt(0).toUpperCase() || "E";
        if (ecoProfileMeta) {
            const refreshed = formatProfileDate(priceTime);
            ecoProfileMeta.textContent = `${profile.companyConfigs.length} companies · ${workerCount} workers${refreshed ? ` · prices ${refreshed}` : ""}`;
        }
    }

    function hideEcoProfileControls() {
        if (ecoProfileCard) ecoProfileCard.hidden = true;
        if (warEconomyControls) warEconomyControls.hidden = true;
    }

    function profileScenario(profile, result) {
        const skillLevels = result?.skillLevels && typeof result.skillLevels === "object"
            ? result.skillLevels
            : profile.alloc;
        return normalizeCalculatedScenario({
            level: profile.config.level,
            profitDay: result?.netProfitDay,
            profitHour: result?.netProfitHour,
            companiesActive: result?.companiesActive,
            companiesConfigured: result?.configuredCompanies,
            employeesActive: result?.employeesActive,
            reservedSkillPoints: result?.totalSpentPoints,
            skillLevels,
            user: profile.importMeta?.user || null,
        });
    }

    function setEcoCalculationReady(ready) {
        ecoCalculationReady = Boolean(ready);
        updateOptimizeButtonState();
    }

    async function recalculateProfileEconomy() {
        const envelope = activeEcoProfileEnvelope;
        if (!envelope) return;
        const sequence = ++ecoCalculationSequence;
        const options = readEcoProfileOptions();
        activeEcoProfileOptions = options;
        persistEcoProfileOptions(options);
        setEcoCalculationReady(false);
        if (warSkillSummary) {
            warSkillSummary.textContent = "Calculating war-mode economy…";
            warSkillSummary.classList.remove("imported");
        }

        try {
            const calculation = await ecoProfileEngine().calculateWarMode(envelope.profile, options);
            if (sequence !== ecoCalculationSequence || envelope !== activeEcoProfileEnvelope) return;
            if (!calculation?.normal || !calculation?.war) {
                throw new Error("Eco Simulator returned an incomplete calculation.");
            }
            importedEcoScenario = profileScenario(envelope.profile, calculation.normal);
            importedWarScenario = profileScenario(envelope.profile, calculation.war);
            applyProfileDerivedFields({ eco: importedEcoScenario, war: importedWarScenario });
            updateImportedEconomySummary();
            saveFormState();
            updatePinBudget();

            const normalRequiredPoints = Math.max(0, Math.floor(Number(calculation.normal.totalSpentPoints) || 0));
            const requiredPoints = Math.max(0, Math.floor(Number(calculation.war.totalSpentPoints) || 0));
            const availablePoints = envelope.profile.config.level * 4;
            if (calculation.normal.isAllocationValid === false || normalRequiredPoints > availablePoints) {
                setEcoCalculationReady(false);
                if (warSkillSummary) {
                    warSkillSummary.textContent = `The imported eco profile needs ${normalRequiredPoints} SP, but level ${envelope.profile.config.level} provides ${availablePoints}. Fix the profile in Eco Simulator before optimizing.`;
                    warSkillSummary.classList.remove("imported");
                }
                return;
            }
            if (calculation.war.isAllocationValid === false || requiredPoints > availablePoints) {
                setEcoCalculationReady(false);
                if (warSkillSummary) {
                    warSkillSummary.textContent = `This war eco setup needs ${requiredPoints} SP, but level ${envelope.profile.config.level} provides ${availablePoints}. Lower one or more eco skills before optimizing.`;
                    warSkillSummary.classList.remove("imported");
                }
                return;
            }

            setEcoCalculationReady(true);
            updateWarSkillSummary(importedWarScenario);
        } catch (error) {
            if (sequence !== ecoCalculationSequence || envelope !== activeEcoProfileEnvelope) return;
            setEcoCalculationReady(false);
            if (warSkillSummary) {
                warSkillSummary.textContent = error.message || "Could not calculate the war-mode economy.";
                warSkillSummary.classList.remove("imported");
            }
        }
    }

    function saveCanonicalEcoProfile(envelope) {
        try {
            localStorage.setItem(ecoProfileEngine().STORAGE_KEY, JSON.stringify(envelope));
        } catch (error) {
            console.warn("Could not save the economy profile.", error);
        }
    }

    async function applyEcoProfileEnvelope(rawEnvelope, restored = false) {
        const envelope = ecoProfileEngine().normalizeEnvelope(rawEnvelope);
        activeEcoProfileEnvelope = envelope;
        importedEcoScenario = null;
        importedWarScenario = null;
        setEcoProfileState(true);
        saveCanonicalEcoProfile(envelope);
        renderEcoProfileCard(envelope);
        activeEcoProfileOptions = restoreEcoProfileOptions(envelope.profile);
        applyEcoProfileOptionsToControls(envelope.profile, activeEcoProfileOptions);
        const savedPlannerLevel = localStorage.getItem("wbt_level");
        if (!restored || savedPlannerLevel === null) {
            setSliderPair("level", envelope.profile.config.level);
        }
        if (ecoImportStatus) {
            const username = envelope.profile.importMeta?.user?.username;
            ecoImportStatus.textContent = `${restored ? "Restored" : "Imported"}${username ? ` ${username}'s` : ""} economy profile. War-mode changes recalculate with Eco Simulator.`;
            ecoImportStatus.classList.add("imported");
        }
        await recalculateProfileEconomy();
    }

    async function decodeDirectEcoProfile(value) {
        const raw = String(value || "").trim();
        if (!raw) throw new Error("The economy profile handoff is empty.");
        if (raw.startsWith("{")) return JSON.parse(raw);
        return decodeBase64UrlJson(raw);
    }

    function removeEcoProfileQueryParam() {
        if (!window.location || !window.history?.replaceState) return;
        const url = new URL(window.location.href);
        if (!url.searchParams.has("ecoProfile")) return;
        url.searchParams.delete("ecoProfile");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    async function initializeEcoProfileHandoff() {
        const handoff = new URL(window.location.href).searchParams.get("ecoProfile");
        if (handoff) setEcoCalculationReady(false);
        try {
            let rawEnvelope;
            if (handoff && handoff !== "latest") {
                rawEnvelope = await decodeDirectEcoProfile(handoff);
            } else {
                const stored = localStorage.getItem(ecoProfileEngine().STORAGE_KEY);
                if (!stored) {
                    if (handoff === "latest") throw new Error("Eco Simulator did not leave an economy profile in this browser.");
                    return;
                }
                rawEnvelope = stored;
            }
            await applyEcoProfileEnvelope(rawEnvelope, !handoff);
            if (handoff) removeEcoProfileQueryParam();
        } catch (error) {
            if (handoff) removeEcoProfileQueryParam();
            activeEcoProfileEnvelope = null;
            activeEcoProfileOptions = null;
            importedEcoScenario = null;
            importedWarScenario = null;
            hideEcoProfileControls();
            setEcoProfileState(false);
            setEcoCalculationReady(true);
            updateImportedEconomySummary();
            updateWarSkillSummary(null);
            if (ecoImportStatus) {
                ecoImportStatus.textContent = error.message || "Could not load the economy profile.";
                ecoImportStatus.classList.remove("imported");
            }
        }
    }

    async function refreshEcoProfile() {
        try {
            const stored = localStorage.getItem(ecoProfileEngine().STORAGE_KEY);
            if (!stored) throw new Error("No economy profile is saved. Open Eco Simulator and choose Use in War Planner.");
            await applyEcoProfileEnvelope(stored);
        } catch (error) {
            if (ecoImportStatus) {
                ecoImportStatus.textContent = error.message || "Could not refresh the economy profile.";
                ecoImportStatus.classList.remove("imported");
            }
        }
    }

    function applyProfileDerivedFields(imported, dispatchEvents = false) {
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
        const profitDelta = warProfitDay - ecoProfitDay;
        if (importedEcoProfitDay) importedEcoProfitDay.textContent = formatMoney(ecoProfitDay);
        if (importedWarProfitDay) importedWarProfitDay.textContent = formatMoney(warProfitDay);
        if (importedWarProfitDelta) {
            importedWarProfitDelta.textContent = `${profitDelta > 0 ? "+" : ""}${formatMoney(profitDelta)}`;
            importedWarProfitDelta.classList.toggle("negative", profitDelta < 0);
            importedWarProfitDelta.classList.toggle("positive", profitDelta > 0);
        }
        if (importedWarSkillPoints) importedWarSkillPoints.textContent = String(Math.max(0, Math.floor(reservedSkillPoints)));
        if (importedActiveCompanies) importedActiveCompanies.textContent = String(importedWarScenario?.companiesActive || 0);
        if (importedActiveWorkers) importedActiveWorkers.textContent = String(importedWarScenario?.employeesActive || 0);
        if (importedEconomySummary) importedEconomySummary.classList.toggle("imported", hasEcoProfile);
    }

    function updateWarSkillSummary(warScenario) {
        if (!hasEcoProfile) {
            if (warSkillSummary) {
                warSkillSummary.textContent = "Import an Economy Profile to calculate eco profit, war profit, and reserved eco skill points.";
                warSkillSummary.classList.remove("imported");
            }
            updateImportedEconomySummary();
            return;
        }
        const reserved = Math.max(0, Math.floor(parseNumericInput("reserved_skill_points", 0)));
        const companiesLevel = warScenario?.skillLevels?.companies || 0;
        const managementLevel = warScenario?.skillLevels?.management || 0;
        const activeCompanies = warScenario?.companiesActive || 0;
        const activeWorkers = warScenario?.employeesActive || 0;
        const text = `War mode reserves ${reserved} skill points before combat optimization. Companies ${companiesLevel}, Management ${managementLevel}; ${activeCompanies} companies and ${activeWorkers} workers are active.`;
        if (warSkillSummary) {
            warSkillSummary.textContent = text;
            warSkillSummary.classList.toggle("imported", reserved > 0);
        }
        updateImportedEconomySummary();
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
            active: hasEcoProfile && (ecoDays > 0 || warDays > 0),
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
            stockpile = startingStockpile - dailyNetCost + campaign.warProfitDay + dailyBountyIncome + dailyBattleLootIncome;
            const endingShortfall = stockpile < -0.000001 ? -stockpile : 0;
            const shortfall = endingShortfall;
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
        const campaignTotalDamage = Math.max(0, Number(build.total_damage) || 0) * warDays;
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
            campaignTotalDamage,
            remainingBudget,
            budgetUsagePct,
            sustainable,
            failedDay,
            largestShortfall,
            lowestStartingBudget,
            dayBudgets,
        };
    }

    function finiteConfigNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function relativeGap(value, otherValue) {
        const first = Math.abs(Number(value));
        const second = Math.abs(Number(otherValue));
        if (!Number.isFinite(first) || !Number.isFinite(second)) return Number.POSITIVE_INFINITY;
        const baseline = Math.max(1, first, second);
        return Math.abs(first - second) / baseline;
    }

    function hasRecommendationGap(candidate, selectedBuild, objective) {
        const damageGap = relativeGap(buildPrimaryValue(candidate, objective), buildPrimaryValue(selectedBuild, objective));
        const costGap = relativeGap(buildEfficiencyValue(candidate), buildEfficiencyValue(selectedBuild));
        return damageGap >= campaignRecommendationDamageGap
            || costGap >= campaignRecommendationCostGap;
    }

    function spaceCampaignRecommendations(builds, objective, pinnedBuild = null) {
        const ordered = builds.slice().sort((a, b) => compareCampaignRecommendationBuilds(a, b, objective));
        const selected = [];
        if (pinnedBuild && builds.includes(pinnedBuild)) {
            selected.push(pinnedBuild);
        }

        for (const build of ordered) {
            if (build === pinnedBuild) continue;
            if (selected.every((selectedBuild) => hasRecommendationGap(build, selectedBuild, objective))) {
                selected.push(build);
                if (selected.length >= campaignRecommendationLimit) break;
            }
        }

        return selected.length ? selected : ordered.slice(0, campaignRecommendationLimit);
    }

    function applyCampaignToBuilds(builds, campaign, objective) {
        if (!campaign.active) {
            return filterDominatedBuilds(builds, objective);
        }

        const annotated = builds.map((build) => {
            const simulation = simulateCampaignBuild(build, campaign);
            const campaignAvgDailyDamage = campaignAverageDailyDamage(simulation.campaignTotalDamage, campaign);
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
                    campaignTotalDamage: simulation.campaignTotalDamage,
                    campaignAvgDailyDamage,
                    sustainable: simulation.sustainable,
                    budgetUsagePct: simulation.budgetUsagePct,
                    failedDay: simulation.failedDay,
                    largestShortfall: simulation.largestShortfall,
                    lowestStartingBudget: simulation.lowestStartingBudget,
                    dayBudgets: simulation.dayBudgets,
                },
            };
        });

        const visibleBuilds = filterDominatedBuilds(
            annotated.filter((build) => build.campaign.budgetUsagePct >= 50),
            objective
        );
        const recommended = selectCampaignRecommendedBuild(visibleBuilds, objective);
        if (recommended) recommended.is_recommended = true;

        return spaceCampaignRecommendations(visibleBuilds, objective, recommended);
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
        const displayedEvaluated = total > 0 ? Math.min(evaluated, total) : evaluated;
        const percent = total > 0 ? Math.min(100, Math.max(0, displayedEvaluated / total * 100)) : 0;
        const workerLabel = progress.workers === "auto" ? "Auto" : `${progress.workers} Threads`;

        resultsDiv.innerHTML = `
            <div class="optimizer-progress">
                <div class="progress-header">
                    <span>${formatProgressNumber(displayedEvaluated)} / ${formatProgressNumber(total)} checks</span>
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

    // --- Shared WarEra API key ---
    function apiKeyStorage() {
        return window.WareraApiKey || null;
    }

    function browserApiKeyStorage() {
        try {
            return window.localStorage;
        } catch (error) {
            return null;
        }
    }

    function setApiKeyUi(state, message) {
        if (apiKeyCard) apiKeyCard.dataset.state = state;
        if (apiKeyStatus) apiKeyStatus.textContent = message;
    }

    function hideApiKeyVisibility() {
        if (apiKeyInput) apiKeyInput.type = "password";
        if (apiKeyToggleBtn) {
            apiKeyToggleBtn.textContent = "Show";
            apiKeyToggleBtn.setAttribute("aria-label", "Show API key");
            apiKeyToggleBtn.setAttribute("aria-pressed", "false");
        }
    }

    function loadSharedApiKeySetting({ updatedInAnotherTab = false } = {}) {
        const manager = apiKeyStorage();
        if (!manager) {
            setApiKeyUi("error", "The shared API-key helper did not load. Refresh this page before optimizing.");
            return;
        }

        const result = manager.load(browserApiKeyStorage());
        if (result.status === "saved") {
            savedSharedApiKey = result.value;
            if (apiKeyInput) apiKeyInput.value = result.value;
            const message = result.compatibilityMirrored === false
                ? "API key saved for both current tools, but an older open version could not be updated. Refresh both tools."
                : (updatedInAnotherTab
                    ? "API key updated in another Toolkit tab and is ready here."
                    : (result.migrated
                        ? "Your existing API key was upgraded and is now shared with both tools."
                        : "API key saved for War Planner and Economy Simulator on this browser."));
            setApiKeyUi("saved", message);
            return;
        }

        savedSharedApiKey = "";
        if (apiKeyInput) apiKeyInput.value = "";
        hideApiKeyVisibility();
        if (result.status === "conflict") {
            setApiKeyUi("conflict", "Two older saved keys differ. Paste the key you want to keep, then save it once for both tools.");
            return;
        }
        if (result.status === "unavailable") {
            setApiKeyUi("error", "Browser storage is unavailable. You can use a key in this tab, but it cannot be shared with Economy Simulator.");
            return;
        }
        setApiKeyUi("missing", "An API key is required to refresh prices and optimize. Save it here or in Economy Simulator.");
    }

    function persistSharedApiKey({ focusWhenMissing = false } = {}) {
        const manager = apiKeyStorage();
        const value = manager
            ? manager.normalize(apiKeyInput?.value)
            : String(apiKeyInput?.value || "").trim();
        if (!value) {
            setApiKeyUi("error", "Paste your WarEra API key before optimizing.");
            if (focusWhenMissing) {
                apiKeyCard?.scrollIntoView({ behavior: "smooth", block: "center" });
                apiKeyInput?.focus();
            }
            return false;
        }
        if (!manager) {
            setApiKeyUi("error", "The key can be used in this tab, but the shared browser-storage helper is unavailable.");
            return true;
        }

        const result = manager.save(browserApiKeyStorage(), value);
        if (result.status !== "saved") {
            setApiKeyUi("error", "The key can be used in this tab, but this browser would not save it for the Toolkit.");
            return true;
        }

        savedSharedApiKey = result.value;
        if (apiKeyInput) apiKeyInput.value = result.value;
        const message = result.compatibilityMirrored === false
            ? "API key saved for both current tools, but an older open version could not be updated. Refresh both tools."
            : "API key saved for War Planner and Economy Simulator on this browser.";
        setApiKeyUi("saved", message);
        return true;
    }

    function clearSharedApiKey() {
        const manager = apiKeyStorage();
        const result = manager ? manager.clear(browserApiKeyStorage()) : { status: "unavailable" };
        if (result.status === "unavailable") {
            const message = result.compatibilityCleared === false
                ? "Could not clear every saved copy of the API key. Check browser storage permissions, then try again."
                : "This browser would not clear the saved Toolkit key. Check browser storage permissions.";
            setApiKeyUi("error", message);
            return;
        }
        savedSharedApiKey = "";
        if (apiKeyInput) {
            apiKeyInput.value = "";
            apiKeyInput.focus();
        }
        hideApiKeyVisibility();
        setApiKeyUi("missing", "API key cleared from both tools on this browser.");
    }

    function markApiKeyInputChanged() {
        const manager = apiKeyStorage();
        const value = manager
            ? manager.normalize(apiKeyInput?.value)
            : String(apiKeyInput?.value || "").trim();
        if (value && value === savedSharedApiKey) {
            setApiKeyUi("saved", "API key saved for War Planner and Economy Simulator on this browser.");
        } else if (value) {
            setApiKeyUi("dirty", "Unsaved change. Save the key now, or it will be saved when you optimize.");
        } else {
            setApiKeyUi("missing", "An API key is required to refresh prices and optimize.");
        }
    }

    function toggleApiKeyVisibility() {
        if (!apiKeyInput || !apiKeyToggleBtn) return;
        const shouldShow = apiKeyInput.type === "password";
        apiKeyInput.type = shouldShow ? "text" : "password";
        apiKeyToggleBtn.textContent = shouldShow ? "Hide" : "Show";
        apiKeyToggleBtn.setAttribute("aria-label", `${shouldShow ? "Hide" : "Show"} API key`);
        apiKeyToggleBtn.setAttribute("aria-pressed", String(shouldShow));
        apiKeyInput.focus();
    }

    function initializeSharedApiKeyControls() {
        apiKeySaveBtn?.addEventListener("click", () => persistSharedApiKey({ focusWhenMissing: true }));
        apiKeyClearBtn?.addEventListener("click", clearSharedApiKey);
        apiKeyToggleBtn?.addEventListener("click", toggleApiKeyVisibility);
        apiKeyInput?.addEventListener("input", markApiKeyInputChanged);
        apiKeyInput?.addEventListener("invalid", () => {
            setApiKeyUi("error", "Paste your WarEra API key before optimizing.");
            apiKeyCard?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        apiKeyInput?.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            persistSharedApiKey({ focusWhenMissing: true });
        });
    }

    // --- localStorage Persistence ---
    function saveFormState() {
        [
            ['wbt_level', 'level-input'],
            ['wbt_rank_bonus', 'rank_bonus-input'],
            ['wbt_battle_bonus', 'battle_bonus-input'],
            ['wbt_workers', 'workers'],
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

        loadSharedApiKeySetting();

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
    buildForm.addEventListener('input', () => {
        if (!activeEcoProfileEnvelope) updateWarSkillSummary(importedWarScenario);
    });
    buildForm.addEventListener('input', updatePinBudget);
    if (refreshEcoProfileBtn) {
        refreshEcoProfileBtn.addEventListener("click", refreshEcoProfile);
    }
    if (warEconomyControls) {
        warEconomyControls.addEventListener("input", (event) => {
            if (!activeEcoProfileEnvelope) return;
            if (event.target === warCompanyCount) {
                applyRequestedCompanyCount();
            } else if (event.target.closest?.("#war-company-list") && warCompanyCount) {
                warCompanyCount.value = String(selectedWarCompanyIds().length);
            }
            updateWarModeControlVisibility();
            recalculateProfileEconomy();
        });
    }
    window.addEventListener("storage", (event) => {
        const storage = browserApiKeyStorage();
        if (
            apiKeyStorage()?.handlesStorageKey(event.key)
            && (!event.storageArea || !storage || event.storageArea === storage)
        ) {
            loadSharedApiKeySetting({ updatedInAnotherTab: true });
        }
        if (event.key === window.WareraEcoEngine?.STORAGE_KEY && event.newValue) {
            applyEcoProfileEnvelope(event.newValue, true).catch((error) => {
                console.warn("Could not apply the updated economy profile.", error);
            });
        }
    });
    if (advancedConfig) {
        advancedConfig.addEventListener('toggle', saveFormState);
    }

    initializePinnedControls();
    initializeProfileImport();
    initializeSharedApiKeyControls();
    restoreFormState();
    updateWarSkillSummary(importedWarScenario);
    updatePinBudget();
    updateAdvancedPlaceholders();
    initializeEcoProfileHandoff();


    // --- Render Builds ---
    function renderBuilds(builds, objective = 'damage') {
        displayedBuilds = Array.isArray(builds) ? builds : [];
        if (!builds || builds.length === 0) {
            viewControls.style.display = 'none';
            const hasPins = [...pinnedConstraints.skills, ...pinnedConstraints.gear, pinnedConstraints.ammo, pinnedConstraints.food]
                .some((value) => value !== null);
            resultsDiv.innerHTML = hasPins
                ? "<p>No builds match the current pins. Check the pinned weapon/ammo combination or reset some slots to Any.</p>"
                : "<p>No optimal builds found. Please adjust your parameters and try again.</p>";
            return;
        }

        viewControls.style.display = '';

        if (viewMode === 'table') {
            renderTable(builds, objective);
            return;
        }

        resultsDiv.innerHTML = builds.map((d, buildIndex) => {
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
                            <span><b>${formatCompactNumber(d.campaign.campaignTotalDamage)}</b><small>Campaign Total Damage</small></span>
                            <span><b>${formatCompactNumber(d.campaign.campaignAvgDailyDamage)} DMG</b><small>Campaign Avg Daily Damage</small></span>
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
                    <button type='button' class='pin-full-build-btn' data-build-index='${buildIndex}' title='Pin all skill levels, gear, ammo, and food from this build for another optimization'>Pin Full Build</button>
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
        if (col === 'eff') return buildEfficiencyValue(d);
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
            const efficiencyValue = buildEfficiencyValue(d).toFixed(2);
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
