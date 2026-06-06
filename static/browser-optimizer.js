(function (global) {
    "use strict";

    const currentScript = document.currentScript;
    const WORKER_URL = new URL("optimizer-worker.js", currentScript ? currentScript.src : window.location.href).href;
    const API_BASE_URL = "https://api2.warera.io/trpc";

    function parseIntOption(value, name, fallback, minValue, maxValue) {
        const parsed = Number.parseInt(value == null || value === "" ? fallback : value, 10);
        if (!Number.isFinite(parsed)) throw new Error(`${name} must be an integer`);
        if (minValue != null && parsed < minValue) throw new Error(`${name} must be at least ${minValue}`);
        if (maxValue != null && parsed > maxValue) throw new Error(`${name} must be at most ${maxValue}`);
        return parsed;
    }

    function parseFloatOption(value, name, fallback, minValue, maxValue) {
        const parsed = Number.parseFloat(value == null || value === "" ? fallback : value);
        if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number`);
        if (minValue != null && parsed < minValue) throw new Error(`${name} must be at least ${minValue}`);
        if (maxValue != null && parsed > maxValue) throw new Error(`${name} must be at most ${maxValue}`);
        return parsed;
    }

    function parseOptimizationRequest(formData) {
        const objective = formData.get("objective") || "damage";
        if (!["damage", "cases"].includes(objective)) {
            throw new Error("objective must be one of: damage, cases");
        }

        const level = parseIntOption(formData.get("level"), "level", 1, 1);
        const importedSkillReserve = parseFloatOption(formData.get("reserved_skill_points"), "reserved_skill_points", 0, 0);
        const rankBonus = 1 + parseFloatOption(formData.get("rank_bonus"), "rank_bonus", 0, 0) / 100;
        const battleBonus = 1 + parseFloatOption(formData.get("battle_bonus"), "battle_bonus", 0, 0) / 100;
        const rawWorkers = String(formData.get("workers") || "").trim().toLowerCase();
        const hardwareConcurrency = Math.max(1, navigator.hardwareConcurrency || 4);
        const workers = rawWorkers === "" || rawWorkers === "auto"
            ? hardwareConcurrency
            : parseIntOption(rawWorkers, "workers", hardwareConcurrency, 1);
        const apiKey = String(formData.get("warera_api_key") || "").trim();
        if (!apiKey) {
            throw new Error("WarEra API key is required.");
        }

        const totalSkillPoints = level * WareraOptimizer.constants.SKILL_POINTS_PER_LEVEL;
        const skillPointReserve = Math.min(totalSkillPoints, importedSkillReserve);

        return {
            level,
            skillPointReserve,
            adjustedLevel: Math.max(0.0, (totalSkillPoints - skillPointReserve) / WareraOptimizer.constants.SKILL_POINTS_PER_LEVEL),
            pill: formData.get("pill") === "on",
            objective,
            rankBonus: rankBonus * battleBonus,
            workers,
            apiKey,
        };
    }

    function buildBatchUrl(procedure, batchInput) {
        const keys = Object.keys(batchInput);
        const procedures = keys.map(() => procedure).join(",");
        const payload = encodeURIComponent(JSON.stringify(batchInput));
        return `${API_BASE_URL}/${procedures}?batch=1&input=${payload}`;
    }

    function extractPriceValue(rawPrice, fallback) {
        if (typeof rawPrice === "number" && Number.isFinite(rawPrice)) return rawPrice;
        if (rawPrice && typeof rawPrice === "object") {
            for (const field of ["price", "value", "cost", "avgPrice", "avg_price"]) {
                if (typeof rawPrice[field] === "number" && Number.isFinite(rawPrice[field])) {
                    return rawPrice[field];
                }
            }
        }
        return fallback;
    }

    function responsePayloads(data) {
        if (Array.isArray(data)) return data.filter((item) => item && typeof item === "object");
        if (data && typeof data === "object") return [data];
        return [];
    }

    async function fetchJson(url, apiKey) {
        const response = await fetch(url, {
            headers: { "X-API-Key": apiKey },
        });
        if (!response.ok) {
            throw new Error(`WarEra API returned ${response.status}`);
        }
        return response.json();
    }

    async function fetchEquipmentPrices(apiKey) {
        const {
            GEAR_SLOTS,
            GEAR_TIERS,
            WEAPON_TIERS,
            TIER_NUM,
        } = WareraOptimizer.constants;

        const batchInput = {};
        const itemKeys = [];
        for (const slot of GEAR_SLOTS) {
            const tiers = slot === "weapon" ? WEAPON_TIERS : GEAR_TIERS;
            for (const tier of tiers) {
                const itemCode = slot === "weapon" ? tier : `${slot}${TIER_NUM[tier]}`;
                batchInput[String(itemKeys.length)] = { itemCode };
                itemKeys.push([slot, tier]);
            }
        }

        const url = buildBatchUrl("gameStat.getEquipmentAvgByCode", batchInput);
        const data = await fetchJson(url, apiKey);
        if (!Array.isArray(data)) throw new Error("Unexpected equipment price response");

        const gearCosts = {};
        itemKeys.forEach(([slot, tier], index) => {
            try {
                const price = extractPriceValue(data[index].result.data, null);
                if (price != null && price > 0) {
                    gearCosts[slot] = gearCosts[slot] || {};
                    gearCosts[slot][tier] = price;
                }
            } catch (error) {
                // Keep bundled price for this item.
            }
        });
        return gearCosts;
    }

    async function fetchConsumablePrices(apiKey) {
        const {
            AMMO_API_MAPPING,
            FOOD_NAMES,
            SCRAP_API_CODE,
            CASE_API_CODE,
            CASE2_API_CODE,
            PILL_API_CODE,
        } = WareraOptimizer.constants;

        const itemCodes = Array.from(new Set([
            ...Object.values(AMMO_API_MAPPING),
            ...FOOD_NAMES,
            SCRAP_API_CODE,
            CASE_API_CODE,
            CASE2_API_CODE,
            PILL_API_CODE,
        ]));
        const batchInput = {};
        itemCodes.forEach((code, index) => {
            batchInput[String(index)] = { itemCode: code };
        });

        const url = buildBatchUrl("itemTrading.getPrices", batchInput);
        const data = await fetchJson(url, apiKey);
        const prices = {};
        for (const payload of responsePayloads(data)) {
            const priceData = payload.result && payload.result.data;
            if (!priceData || typeof priceData !== "object") continue;
            for (const code of itemCodes) {
                if (Object.prototype.hasOwnProperty.call(priceData, code)) {
                    prices[code] = extractPriceValue(priceData[code], 0.0);
                }
            }
        }

        const foodCosts = {};
        for (const foodName of FOOD_NAMES) {
            if (prices[foodName] > 0) foodCosts[foodName] = prices[foodName];
        }

        const ammoCosts = {};
        for (const itemCode of Object.values(AMMO_API_MAPPING)) {
            if (prices[itemCode] > 0) ammoCosts[itemCode] = prices[itemCode];
        }

        return {
            foodCosts,
            ammoCosts,
            rewards: {
                scrap_price: prices[SCRAP_API_CODE] || 0.0,
                case1_price: prices[CASE_API_CODE] || 0.0,
                case2_price: prices[CASE2_API_CODE] || 0.0,
                pill_price: prices[PILL_API_CODE] || 0.0,
            },
        };
    }

    async function fetchMarketPrices(apiKey, onProgress) {
        try {
            if (onProgress) onProgress({ phase: "prices" });
            const [gearCosts, consumables] = await Promise.all([
                fetchEquipmentPrices(apiKey),
                fetchConsumablePrices(apiKey),
            ]);
            return {
                gearCosts,
                foodCosts: consumables.foodCosts,
                ammoCosts: consumables.ammoCosts,
                rewards: consumables.rewards,
            };
        } catch (error) {
            console.warn("Market price refresh failed in browser.", error);
            throw new Error("Could not refresh market prices with that API key.");
        }
    }

    function splitRanges(total, workerCount) {
        const count = Math.max(1, Math.min(workerCount, total));
        const base = Math.floor(total / count);
        const remainder = total % count;
        const ranges = [];
        let start = 0;
        for (let index = 0; index < count; index += 1) {
            const size = base + (index < remainder ? 1 : 0);
            ranges.push([start, start + size]);
            start += size;
        }
        return ranges;
    }

    function runOnMainThread(options, plan, onProgress) {
        const result = WareraOptimizer.runSearch({
            ...options,
            workerId: 0,
            sustainStart: 0,
            sustainEnd: plan.sustainCount,
        }, (evaluated) => {
            if (onProgress) onProgress({ evaluated, total: plan.checks, workers: 1 });
        });
        return WareraOptimizer.prepareResponse([result], options);
    }

    function runWorkerPool(options, plan, onProgress) {
        if (!global.Worker) {
            return Promise.resolve(runOnMainThread(options, plan, onProgress));
        }

        const ranges = splitRanges(plan.sustainCount, options.workers);
        const progressByWorker = Array(ranges.length).fill(0);
        const results = [];
        const workers = [];

        return new Promise((resolve, reject) => {
            let finished = 0;
            let failed = false;

            function terminateAll() {
                for (const worker of workers) worker.terminate();
            }

            ranges.forEach(([sustainStart, sustainEnd], workerId) => {
                const worker = new Worker(WORKER_URL);
                workers.push(worker);
                const workerTotal = (sustainEnd - sustainStart) * plan.combatCount * (plan.budget + 1);

                worker.onmessage = (event) => {
                    const message = event.data || {};
                    if (message.type === "progress") {
                        progressByWorker[workerId] = message.evaluated;
                        if (onProgress) {
                            onProgress({
                                evaluated: progressByWorker.reduce((sum, value) => sum + value, 0),
                                total: plan.checks,
                                workers: ranges.length,
                            });
                        }
                    } else if (message.type === "result") {
                        progressByWorker[workerId] = workerTotal;
                        results[workerId] = message.result;
                        worker.terminate();
                        finished += 1;
                        if (finished === ranges.length && !failed) {
                            resolve(WareraOptimizer.prepareResponse(results, options));
                        }
                    } else if (message.type === "error") {
                        failed = true;
                        terminateAll();
                        reject(new Error(message.error || "Worker optimization failed"));
                    }
                };

                worker.onerror = (error) => {
                    failed = true;
                    terminateAll();
                    reject(new Error(error.message || "Worker optimization failed"));
                };

                worker.postMessage({
                    type: "run",
                    options: {
                        ...options,
                        sustainStart,
                        sustainEnd,
                        workerId,
                    },
                });
            });
        });
    }

    async function run(formData, callbacks) {
        const onProgress = callbacks && callbacks.onProgress;
        const options = parseOptimizationRequest(formData);
        const priceOverrides = await fetchMarketPrices(options.apiKey, onProgress);
        const runOptions = {
            ...options,
            priceOverrides,
        };
        const plan = WareraOptimizer.getSearchPlan(runOptions);
        runOptions.workers = Math.min(runOptions.workers, plan.sustainCount);

        if (onProgress) {
            onProgress({
                evaluated: 0,
                total: plan.checks,
                workers: runOptions.workers,
            });
        }

        return runWorkerPool(runOptions, plan, onProgress);
    }

    global.WareraBrowserOptimizer = {
        run,
        parseOptimizationRequest,
    };
})(window);
