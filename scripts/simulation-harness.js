const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_CASES_PATH = path.join(PROJECT_ROOT, "tests", "fixtures", "simulation_cases.json");
const DEFAULT_BENCHMARK_CASES_PATH = path.join(PROJECT_ROOT, "tests", "fixtures", "benchmark_cases.json");
const DEFAULT_OBJECTIVES_PATH = path.join(PROJECT_ROOT, "tests", "fixtures", "simulation_objectives.json");

let optimizerLoaded = false;

function loadOptimizerCore() {
    if (!optimizerLoaded) {
        require(path.join(PROJECT_ROOT, "static", "optimizer-core.js"));
        optimizerLoaded = true;
    }
    if (!globalThis.WareraOptimizer) {
        throw new Error("WareraOptimizer did not load from static/optimizer-core.js");
    }
    return globalThis.WareraOptimizer;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadCases(filePath = DEFAULT_CASES_PATH) {
    const payload = readJson(filePath);
    const cases = Array.isArray(payload) ? payload : payload.cases;
    if (!Array.isArray(cases)) {
        throw new Error(`${filePath} must contain a cases array`);
    }
    return cases;
}

function finiteNumber(value, fallback, name) {
    if (value === undefined || value === null || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${name} must be a finite number`);
    }
    return parsed;
}

function finiteArray(values) {
    if (!Array.isArray(values)) return [];
    return values.map(Number).filter(Number.isFinite);
}

function normalizeOptions(testCase) {
    const optimizer = loadOptimizerCore();
    const options = { ...(testCase.options || {}) };
    const level = finiteNumber(testCase.level ?? options.level, 1, "level");
    const totalSkillPoints = level * optimizer.constants.SKILL_POINTS_PER_LEVEL;
    const reservedSkillPoints = Math.max(0, finiteNumber(
        testCase.reservedSkillPoints ?? options.reservedSkillPoints,
        0,
        "reservedSkillPoints"
    ));
    const skillPointReserve = Math.min(totalSkillPoints, reservedSkillPoints);
    const adjustedLevel = options.adjustedLevel === undefined
        ? Math.max(0, (totalSkillPoints - skillPointReserve) / optimizer.constants.SKILL_POINTS_PER_LEVEL)
        : finiteNumber(options.adjustedLevel, 0, "adjustedLevel");

    const normalized = {
        adjustedLevel,
        pill: Boolean(options.pill),
        objective: options.objective || "damage",
        rankBonus: finiteNumber(options.rankBonus, 1, "rankBonus"),
        budgetTargets: finiteArray(options.budgetTargets),
    };

    for (const key of [
        "dailyBudget",
        "campaignBudget",
        "campaignInitialStockpile",
        "campaignWarProfitDay",
        "campaignWarDays",
        "bountyPer1kDamage",
        "battleLootPer1kDamage",
        "sustainStart",
        "sustainEnd",
        "workerId",
    ]) {
        if (options[key] !== undefined) {
            normalized[key] = finiteNumber(options[key], 0, key);
        }
    }

    if (options.priceOverrides) {
        normalized.priceOverrides = options.priceOverrides;
    }

    return normalized;
}

function roundNumber(value, digits = 6) {
    if (!Number.isFinite(Number(value))) return value;
    return Number(Number(value).toFixed(digits));
}

function roundObject(value, digits = 6) {
    if (Array.isArray(value)) return value.map((item) => roundObject(item, digits));
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundObject(item, digits)]));
    }
    return typeof value === "number" ? roundNumber(value, digits) : value;
}

function summarizeCampaign(campaign) {
    return roundObject({
        dailyNetCost: campaign.dailyNetCost,
        dailyBountyIncome: campaign.dailyBountyIncome,
        dailyBattleLootIncome: campaign.dailyBattleLootIncome,
        bountyIncome: campaign.bountyIncome,
        battleLootIncome: campaign.battleLootIncome,
        availableBudget: campaign.availableBudget,
        warTotalCost: campaign.warTotalCost,
        remainingBudget: campaign.remainingBudget,
        budgetUsagePct: campaign.budgetUsagePct,
        sustainable: campaign.sustainable,
        failedDay: campaign.failedDay,
        largestShortfall: campaign.largestShortfall,
        lowestStartingBudget: campaign.lowestStartingBudget,
        dayBudgets: campaign.dayBudgets,
    });
}

function summarizeBuild(build, options) {
    const optimizer = loadOptimizerCore();
    const summary = roundObject({
        skill_lvls: build.skill_lvls,
        gear_idx: build.gear_idx,
        ammo_name: build.ammo_name,
        food_name: build.food_name,
        ammo_quantity: build.ammo_quantity,
        food_quantity: build.food_quantity,
        total_damage: build.total_damage,
        total_cost: build.total_cost,
        net_cost: build.net_cost,
        n_attacks: build.diag && build.diag.n_attacks,
        cases_per_day: build.cases_per_day,
        elite_cases_per_day: build.elite_cases_per_day,
        total_scrap_generated: build.total_scrap_generated,
    });

    if (Number.isFinite(Number(options.campaignBudget))) {
        summary.campaign = summarizeCampaign(optimizer.simulateCampaignBuild(build, options));
    }

    return summary;
}

function caseConfigSummary(testCase, options) {
    return roundObject({
        level: testCase.level,
        reservedSkillPoints: testCase.reservedSkillPoints || 0,
        adjustedLevel: options.adjustedLevel,
        pill: options.pill,
        objective: options.objective,
        rankBonus: options.rankBonus,
        budgetTargets: options.budgetTargets,
        campaignBudget: options.campaignBudget,
        campaignInitialStockpile: options.campaignInitialStockpile,
        campaignWarProfitDay: options.campaignWarProfitDay,
        campaignWarDays: options.campaignWarDays,
        bountyPer1kDamage: options.bountyPer1kDamage,
        battleLootPer1kDamage: options.battleLootPer1kDamage,
        priceOverrides: options.priceOverrides,
    });
}

function runCase(testCase, settings = {}) {
    const optimizer = loadOptimizerCore();
    const options = normalizeOptions(testCase);
    const plan = optimizer.getSearchPlan(options);
    const start = performance.now();
    const workerResult = optimizer.runSearch(options);
    const response = optimizer.prepareResponse([workerResult], options);
    const elapsedMs = performance.now() - start;
    const allBuilds = response.all_builds || [];

    const output = {
        name: testCase.name,
        config: caseConfigSummary(testCase, options),
        plan,
        result: roundObject({
            evaluated: workerResult.evaluated,
            total: workerResult.total,
            buildCount: response.builds.length,
            allBuildCount: allBuilds.length,
            maxDamageValue: response.max_damage_value,
            maxNetCostValue: response.max_net_cost_value,
        }),
        bestBuild: allBuilds.length ? summarizeBuild(allBuilds[0], options) : null,
        selectedBuilds: (response.builds || []).map((build) => summarizeBuild(build, options)),
    };

    if (settings.includeTiming) {
        output.elapsedMs = roundNumber(elapsedMs, 3);
    }

    return output;
}

function buildObjectives(cases) {
    return {
        schemaVersion: 1,
        generatedBy: "node scripts/simulation-objectives.js",
        cases: cases.map((testCase) => runCase(testCase)),
    };
}

function simulateCampaignForBuild(build, options) {
    const optimizer = loadOptimizerCore();
    return summarizeCampaign(optimizer.simulateCampaignBuild(build, options || {}));
}

module.exports = {
    PROJECT_ROOT,
    DEFAULT_BENCHMARK_CASES_PATH,
    DEFAULT_CASES_PATH,
    DEFAULT_OBJECTIVES_PATH,
    buildObjectives,
    loadCases,
    normalizeOptions,
    runCase,
    simulateCampaignForBuild,
};
