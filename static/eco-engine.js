(function (global) {
    "use strict";

    const STORAGE_KEY = "warera-eco-profile-v1";
    const PROFILE_SOURCE = "warera-eco-simulator-profile";
    const PROFILE_VERSION = 1;
    const MAX_SKILL_LEVEL = 10;
    const BASE_COMPANIES = 2;
    const BASE_MANAGEMENT = 4;
    const MANAGEMENT_PER_LEVEL = 2;
    const SKILL_KEYS = ["energy", "entrepreneurship", "production", "companies", "management"];
    const MATERIAL_IDS = [
        "limestone", "iron", "petroleum", "wood", "concrete", "steel", "oil", "paper",
        "grain", "livestock", "fish", "bread", "steak", "cooked_fish", "lead",
        "light_ammo", "ammo", "heavy_ammo", "mysterious_plant", "pill",
    ];

    let injectedSimulationModule = null;
    let simulationModulePromise = null;

    function finiteNumber(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function boundedInteger(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
        return clamp(Math.floor(finiteNumber(value, fallback)), min, max);
    }

    function skillLevel(value, fallback = 0) {
        return boundedInteger(value, fallback, 0, MAX_SKILL_LEVEL);
    }

    function safeString(value) {
        return typeof value === "string" ? value : "";
    }

    function normalizeTimestamp(value, required = false) {
        const text = safeString(value).trim();
        if (!text) {
            if (required) throw new Error("The economy profile does not include a valid generation time.");
            return null;
        }
        const timestamp = Date.parse(text);
        if (!Number.isFinite(timestamp)) {
            if (required) throw new Error("The economy profile generation time is invalid.");
            return null;
        }
        return new Date(timestamp).toISOString();
    }

    function normalizeWorker(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        return {
            productionPerAction: Math.max(0, finiteNumber(source.productionPerAction, 31)),
            energyPer10h: Math.max(0, finiteNumber(source.energyPer10h, 100)),
            wagePerPP: Math.max(0, finiteNumber(source.wagePerPP, 0.135)),
            fidelityPct: clamp(finiteNumber(source.fidelityPct, 0), 0, 10),
        };
    }

    function normalizeCompany(raw, index) {
        const source = raw && typeof raw === "object" ? raw : {};
        const candidateId = Math.floor(finiteNumber(source.id, index + 1));
        const specialization = MATERIAL_IDS.includes(source.specialization)
            ? source.specialization
            : MATERIAL_IDS[0];
        return {
            id: candidateId > 0 ? candidateId : index + 1,
            specialization,
            aeLevel: boundedInteger(source.aeLevel, 1, 1, 7),
            productionBonusPct: Math.max(0, finiteNumber(source.productionBonusPct, 0)),
            manualActionsPer10h: Math.max(0, boundedInteger(source.manualActionsPer10h, 0)),
            workers: Array.isArray(source.workers) ? source.workers.map(normalizeWorker) : [],
            wagePerPP: Math.max(0, finiteNumber(source.wagePerPP, 0.135)),
        };
    }

    function normalizeKnownNumberMap(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        return Object.fromEntries(MATERIAL_IDS.map((id) => [id, Math.max(0, finiteNumber(source[id], 0))]));
    }

    function normalizeImportMeta(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        const user = source.user && typeof source.user === "object" ? source.user : {};
        const userId = safeString(user.id).trim();
        const username = safeString(user.username).trim();
        if (!userId && !username) return null;
        return {
            user: {
                id: userId,
                username,
            },
        };
    }

    function normalizeSyncMeta(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        return {
            pricesSyncedAt: normalizeTimestamp(source.pricesSyncedAt),
            bonusesSyncedAt: normalizeTimestamp(source.bonusesSyncedAt),
        };
    }

    function normalizeProfile(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            throw new Error("The economy profile is missing or invalid.");
        }
        if (!raw.config || typeof raw.config !== "object") {
            throw new Error("The economy profile does not include its configuration.");
        }
        if (!raw.alloc || typeof raw.alloc !== "object") {
            throw new Error("The economy profile does not include its skill allocation.");
        }
        if (!Array.isArray(raw.companyConfigs)) {
            throw new Error("The economy profile does not include company configurations.");
        }

        const companies = raw.companyConfigs.map(normalizeCompany);
        const seenIds = new Set();
        for (let index = 0; index < companies.length; index += 1) {
            let id = companies[index].id;
            while (seenIds.has(id)) id += 1;
            companies[index].id = id;
            seenIds.add(id);
        }

        const rawConfig = raw.config;
        const rawAlloc = raw.alloc;
        const normalized = {
            savedAt: normalizeTimestamp(raw.savedAt),
            config: {
                level: boundedInteger(rawConfig.level, 1, 1),
                workUsage: clamp(finiteNumber(rawConfig.workUsage, 0), 0, 100),
                entreUsage: clamp(finiteNumber(rawConfig.entreUsage, 0), 0, 100),
                companyUtilization: clamp(finiteNumber(rawConfig.companyUtilization, 0), 0, 100),
                ownWage: Math.max(0, finiteNumber(rawConfig.ownWage, 0)),
                ignoreDepositBonuses: rawConfig.ignoreDepositBonuses === true,
                entrePlanSlots: Array.isArray(rawConfig.entrePlanSlots)
                    ? rawConfig.entrePlanSlots.map((value) => {
                        const parsed = Math.floor(Number(value));
                        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
                    })
                    : [],
                objective: safeString(rawConfig.objective) || "netProfitDay",
            },
            alloc: Object.fromEntries(SKILL_KEYS.map((key) => [key, skillLevel(rawAlloc[key], 0)])),
            prices: normalizeKnownNumberMap(raw.prices),
            materialProductionBonuses: normalizeKnownNumberMap(raw.materialProductionBonuses),
            companyConfigs: companies,
            hasCompanyConfigs: typeof raw.hasCompanyConfigs === "boolean"
                ? raw.hasCompanyConfigs
                : Array.isArray(raw.companyConfigs),
            importMeta: normalizeImportMeta(raw.importMeta),
            syncMeta: normalizeSyncMeta(raw.syncMeta),
        };

        return normalized;
    }

    function parseEnvelopeInput(raw) {
        if (typeof raw === "string") {
            try {
                return JSON.parse(raw);
            } catch {
                throw new Error("The saved economy profile is not valid JSON.");
            }
        }
        return raw;
    }

    function normalizeEnvelope(raw) {
        const source = parseEnvelopeInput(raw);
        if (!source || typeof source !== "object" || Array.isArray(source)) {
            throw new Error("The saved economy profile is invalid.");
        }
        if (source.v !== PROFILE_VERSION || source.source !== PROFILE_SOURCE) {
            throw new Error("This is not a supported WarEra economy profile.");
        }
        return {
            v: PROFILE_VERSION,
            source: PROFILE_SOURCE,
            generatedAt: normalizeTimestamp(source.generatedAt, true),
            profile: normalizeProfile(source.profile),
        };
    }

    function levelCost(level) {
        const normalized = skillLevel(level);
        return normalized * (normalized + 1) / 2;
    }

    function totalSkillPoints(allocation) {
        return SKILL_KEYS.reduce((total, key) => total + levelCost(allocation?.[key]), 0);
    }

    function minimumCompaniesLevel(companyCount) {
        return skillLevel(Math.max(0, Math.ceil(finiteNumber(companyCount, 0) - BASE_COMPANIES)));
    }

    function minimumManagementLevel(workerCount) {
        const additionalWorkers = Math.max(0, finiteNumber(workerCount, 0) - BASE_MANAGEMENT);
        return skillLevel(Math.ceil(additionalWorkers / MANAGEMENT_PER_LEVEL));
    }

    function companyIdSet(profile) {
        return new Set(profile.companyConfigs.map((company) => company.id));
    }

    function resolveActiveCompanies(profile, options) {
        const companies = profile.companyConfigs;
        const knownIds = companyIdSet(profile);
        const hasExplicitIds = Array.isArray(options.activeCompanyIds);
        let requestedIds = hasExplicitIds
            ? options.activeCompanyIds.map((value) => Math.floor(Number(value))).filter((id) => knownIds.has(id))
            : [];
        requestedIds = requestedIds.filter((id, index) => requestedIds.indexOf(id) === index);

        const defaultCount = Math.min(companies.length, BASE_COMPANIES + profile.alloc.companies);
        const requestedCount = options.companyCount === undefined || options.companyCount === null || options.companyCount === ""
            ? (hasExplicitIds ? requestedIds.length : defaultCount)
            : boundedInteger(options.companyCount, defaultCount, 0, companies.length);
        requestedIds = requestedIds.slice(0, requestedCount);
        if (requestedIds.length < requestedCount) {
            for (const company of companies) {
                if (!requestedIds.includes(company.id)) requestedIds.push(company.id);
                if (requestedIds.length >= requestedCount) break;
            }
        }
        const requestedSet = new Set(requestedIds);
        return companies.filter((company) => requestedSet.has(company.id));
    }

    function deriveWarAllocation(rawProfile, rawOptions = {}) {
        const profile = normalizeProfile(rawProfile);
        const options = rawOptions && typeof rawOptions === "object" ? rawOptions : {};
        const mode = ["minimum", "current", "custom"].includes(options.mode) ? options.mode : "minimum";
        const includeWorkers = options.includeWorkers !== false;
        const selectedCompanies = resolveActiveCompanies(profile, options).map((company) => ({
            ...company,
            workers: includeWorkers ? company.workers.map((worker) => ({ ...worker })) : [],
        }));
        const workerCount = selectedCompanies.reduce((sum, company) => sum + company.workers.length, 0);
        let allocation;

        if (mode === "current") {
            allocation = { ...profile.alloc };
        } else if (mode === "custom") {
            const custom = options.customSkills && typeof options.customSkills === "object"
                ? options.customSkills
                : {};
            allocation = Object.fromEntries(SKILL_KEYS.map((key) => [key, skillLevel(custom[key], profile.alloc[key])]));
        } else {
            allocation = {
                energy: 0,
                entrepreneurship: 0,
                production: 0,
                companies: minimumCompaniesLevel(selectedCompanies.length),
                management: includeWorkers ? minimumManagementLevel(workerCount) : 0,
            };
        }

        return {
            mode,
            allocation,
            reservedSkillPoints: totalSkillPoints(allocation),
            activeCompanyIds: selectedCompanies.map((company) => company.id),
            companyConfigs: selectedCompanies,
            workerCount,
            includeWorkers,
        };
    }

    function defaultSimulationModuleUrl() {
        if (safeString(global.WARERA_ECO_SIMULATION_MODULE_URL)) {
            return global.WARERA_ECO_SIMULATION_MODULE_URL;
        }
        const locationHref = global.location && global.location.href
            ? global.location.href
            : "https://warera.xorgress.com/war-planner/";
        return new URL("../eco-simulator/src/core/snapshot-simulation.js?v=20260724-01", locationHref).href;
    }

    async function loadSimulationModule() {
        if (injectedSimulationModule) return injectedSimulationModule;
        if (!simulationModulePromise) {
            const moduleUrl = defaultSimulationModuleUrl();
            simulationModulePromise = import(moduleUrl).then((module) => {
                if (!module || typeof module.simulateSnapshot !== "function") {
                    throw new Error("Eco Simulator did not provide a compatible simulation adapter.");
                }
                return module;
            }).catch((error) => {
                simulationModulePromise = null;
                throw new Error(`Could not load the Eco Simulator calculation engine. ${error?.message || ""}`.trim());
            });
        }
        return simulationModulePromise;
    }

    function buildWarSnapshot(profile, derived) {
        const activeIds = new Set(derived.activeCompanyIds);
        return {
            ...profile,
            config: {
                ...profile.config,
                entrePlanSlots: profile.config.entrePlanSlots.map((id) => activeIds.has(id) ? id : null),
            },
            alloc: { ...derived.allocation },
            companyConfigs: derived.companyConfigs.map((company) => ({
                ...company,
                workers: company.workers.map((worker) => ({ ...worker })),
            })),
        };
    }

    async function simulateProfile(rawProfile, overrides = {}) {
        const profile = normalizeProfile(rawProfile);
        const module = await loadSimulationModule();
        return module.simulateSnapshot(profile, overrides);
    }

    async function calculateWarMode(rawProfile, options = {}) {
        const profile = normalizeProfile(rawProfile);
        const derived = deriveWarAllocation(profile, options);
        const warProfile = buildWarSnapshot(profile, derived);
        const module = await loadSimulationModule();
        const [normal, war] = await Promise.all([
            module.simulateSnapshot(profile),
            module.simulateSnapshot(warProfile),
        ]);
        return {
            normal,
            war,
            allocation: derived.allocation,
            reservedSkillPoints: derived.reservedSkillPoints,
            activeCompanyIds: derived.activeCompanyIds,
            requestedCompanyCount: derived.companyConfigs.length,
            configuredWorkerCount: derived.workerCount,
            includeWorkers: derived.includeWorkers,
            warProfile,
        };
    }

    function setSimulationModuleForTests(module) {
        injectedSimulationModule = module || null;
        simulationModulePromise = null;
    }

    const api = {
        STORAGE_KEY,
        PROFILE_SOURCE,
        PROFILE_VERSION,
        SKILL_KEYS: SKILL_KEYS.slice(),
        normalizeEnvelope,
        normalizeProfile,
        levelCost,
        totalSkillPoints,
        minimumCompaniesLevel,
        minimumManagementLevel,
        deriveWarAllocation,
        simulateProfile,
        calculateWarMode,
        setSimulationModuleForTests,
    };

    global.WareraEcoEngine = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
