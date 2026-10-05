(function (global) {
    "use strict";

    const currentScript = document.currentScript;
    const scriptUrl = new URL(currentScript ? currentScript.src : window.location.href);
    const workerUrl = new URL("optimizer-worker.js", scriptUrl);
    workerUrl.search = scriptUrl.search;
    const WORKER_URL = workerUrl.href;
    const API_BASE_URL = "https://api2.warera.io/trpc";
    const ROLL_CACHE_KEY = "wbt-gear-market-curves-v1";
    const STAT_KEYS = { attack: "atk", criticalChance: "critc", criticalDamages: "critd", precision: "prc", armor: "arm", dodge: "ddg" };

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

    function parseBoolOption(value, fallback = true) {
        if (value == null || value === "") return fallback;
        return ["1", "true", "on", "yes"].includes(String(value).toLowerCase());
    }

    function parseJsonOption(value, name, fallback) {
        if (value == null || String(value).trim() === "") return fallback;
        try {
            return JSON.parse(String(value));
        } catch (error) {
            throw new Error(`${name} must be valid JSON`);
        }
    }

    function parsePinnedArray(value, name, length, maxValue) {
        const parsed = parseJsonOption(value, name, Array(length).fill(null));
        if (!Array.isArray(parsed) || parsed.length !== length) {
            throw new Error(`${name} must be a JSON array with ${length} entries`);
        }
        return parsed.map((entry, index) => {
            if (entry === null) return null;
            if (!Number.isInteger(entry) || entry < 0 || entry > maxValue) {
                throw new Error(`${name}[${index}] must be null or an integer from 0 to ${maxValue}`);
            }
            return entry;
        });
    }

    function parsePinnedIndex(value, name, maxValue) {
        const parsed = parseJsonOption(value, name, null);
        if (parsed === null) return null;
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > maxValue) {
            throw new Error(`${name} must be null or an integer from 0 to ${maxValue}`);
        }
        return parsed;
    }

    function parseOptimizationRequest(formData) {
        const objective = formData.get("objective") || "damage";
        if (objective !== "damage") {
            throw new Error("objective must be damage");
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
        const pinnedSkills = parsePinnedArray(formData.get("pinned_skills"), "pinned_skills", 9, 10);
        const pinnedGear = parsePinnedArray(formData.get("pinned_gear"), "pinned_gear", 6, 6);
        const pinnedGearStats = parseJsonOption(formData.get("pinned_gear_stats"), "pinned_gear_stats", Array(6).fill(null));
        if (!Array.isArray(pinnedGearStats) || pinnedGearStats.length !== 6) throw new Error("Pinned gear stats must contain six slots.");
        const pinnedAmmo = parsePinnedIndex(formData.get("pinned_ammo"), "pinned_ammo", 3);
        const pinnedFood = parsePinnedIndex(formData.get("pinned_food"), "pinned_food", 3);
        const availableSkillPoints = Math.max(0, Math.floor(totalSkillPoints - skillPointReserve));
        const pinnedSkillCost = pinnedSkills.reduce((total, skillLevel) => (
            total + (skillLevel === null ? 0 : WareraOptimizer.constants.SKILL_LEVEL_COST[skillLevel])
        ), 0);
        if (pinnedSkillCost > availableSkillPoints) {
            throw new Error(`Pinned skills cost ${pinnedSkillCost} SP, but only ${availableSkillPoints} SP are available after reserves.`);
        }
        const campaignProfileImported = parseBoolOption(formData.get("eco_profile_imported"), false);
        const ecoDays = parseIntOption(formData.get("eco_days"), "eco_days", 0, 0);
        const warDays = parseIntOption(formData.get("war_days"), "war_days", 1, 1);
        const ecoProfitDay = parseFloatOption(formData.get("eco_profit_day"), "eco_profit_day", 0);
        const earningBountyEnabled = parseBoolOption(formData.get("earning_bounty_enabled"), true);
        const earningBattleLootEnabled = parseBoolOption(formData.get("earning_battle_loot_enabled"), true);
        const earningCasesEnabled = parseBoolOption(formData.get("earning_cases_enabled"), true);
        const earningScrapEnabled = parseBoolOption(formData.get("earning_scrap_enabled"), true);
        const earningCompaniesEnabled = parseBoolOption(formData.get("earning_companies_enabled"), true);
        const warProfitDay = earningCompaniesEnabled ? parseFloatOption(formData.get("war_profit_day"), "war_profit_day", 0) : 0;
        const bountyPer1kDamage = earningBountyEnabled ? parseFloatOption(formData.get("bounty_per_1k_damage"), "bounty_per_1k_damage", 0, 0) : 0;
        const battleLootPer1kDamage = earningBattleLootEnabled ? 0.13 : 0;
        const stockpiledMoney = parseFloatOption(formData.get("stockpiled_money"), "stockpiled_money", 0, 0);
        const ecoBudget = ecoProfitDay * ecoDays + stockpiledMoney;
        const campaignBudget = ecoBudget + warProfitDay * warDays;
        const campaignActive = campaignProfileImported && campaignBudget > 0 && warDays > 0;
        const dailyBudget = campaignActive ? campaignBudget / warDays : null;
        const budgetTargets = campaignActive ? [
            campaignBudget * 0.10,
            campaignBudget * 0.25,
            campaignBudget * 0.35,
            campaignBudget * 0.5,
            campaignBudget * 0.65,
            campaignBudget * 0.75,
            campaignBudget * 0.9,
            campaignBudget,
            campaignBudget * 1.1,
            campaignBudget * 1.25,
            campaignBudget * 1.5,
            campaignBudget * 1.75,
            campaignBudget * 2,
            campaignBudget * 3,
            campaignBudget * 5,
        ] : [];

        return {
            level,
            skillPointReserve,
            adjustedLevel: Math.max(0.0, (totalSkillPoints - skillPointReserve) / WareraOptimizer.constants.SKILL_POINTS_PER_LEVEL),
            pinnedSkills,
            pinnedGear,
            pinnedGearStats,
            pinnedAmmo,
            pinnedFood,
            pill: formData.get("pill") === "on",
            objective,
            rankBonus: rankBonus * battleBonus,
            workers,
            apiKey,
            dailyBudget,
            campaignBudget: campaignActive ? campaignBudget : null,
            campaignInitialStockpile: campaignActive ? ecoBudget : null,
            campaignWarProfitDay: campaignActive ? warProfitDay : 0,
            campaignWarDays: warDays,
            bountyPer1kDamage,
            battleLootPer1kDamage,
            earningCasesEnabled,
            earningScrapEnabled,
            budgetTargets,
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

    async function fetchJson(url, apiKey, input) {
        const response = await fetch(url, {
            method: input ? "POST" : "GET",
            headers: input ? { "X-API-Key": apiKey, "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" } : { "X-API-Key": apiKey },
            ...(input ? { body: JSON.stringify(input) } : {}),
            signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
            const error = new Error(`WarEra API returned ${response.status}`);
            error.status = response.status;
            throw error;
        }
        return response.json();
    }

    function median(values) {
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    function analyzeGearTransactions(rows, ranges, itemCode) {
        const samples = [];
        const seen = new Set();
        for (const row of rows) {
            if (row._id && seen.has(row._id)) continue;
            if (row._id) seen.add(row._id);
            const item = row.item;
            if (!item || item.code !== itemCode || !item.skills) continue;
            const mods = Object.fromEntries(Object.entries(item.skills).filter(([key]) => STAT_KEYS[key]).map(([key, value]) => [STAT_KEYS[key], value]));
            if (!Object.entries(ranges).every(([stat, [min, max]]) => Number.isFinite(mods[stat]) && mods[stat] >= min && mods[stat] <= max)) continue;
            const durability = Number(item.state) / Number(item.maxState);
            const quantity = Number(row.quantity || item.quantity || 1);
            const price = Number(row.money) / quantity / durability;
            if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(durability) || durability < 0.25 || durability > 1 || quantity <= 0) continue;
            const quality = WareraOptimizer.rollQuality(mods, ranges);
            samples.push({ quality, price, mods });
        }
        if (!samples.length) return { curve: [], samples: 0 };
        const center = median(samples.map(sample => sample.price));
        const filtered = samples.filter(sample => sample.price >= center / 4 && sample.price <= center * 4);
        const buckets = new Map();
        for (const sample of filtered) {
            const band = Math.min(9, Math.floor(sample.quality * 10));
            if (!buckets.has(band)) buckets.set(band, []);
            buckets.get(band).push(sample);
        }
        const curve = Array.from(buckets.values()).filter(bucket => bucket.length >= 3).map(bucket => ({
            quality: bucket.reduce((sum, sample) => sum + sample.quality, 0) / bucket.length,
            price: median(bucket.map(sample => sample.price)),
            sampleSize: bucket.length,
        })).sort((a, b) => a.quality - b.quality);
        return { curve: curve.length >= 2 ? curve : [], samples: filtered.length };
    }

    async function fetchGearRollMarket(apiKey, options, onProgress) {
        const wanted = WareraOptimizer.constants.GEAR_SLOTS.flatMap((slot, index) => {
            const tiers = slot === "weapon" ? WareraOptimizer.constants.WEAPON_TIERS : WareraOptimizer.constants.GEAR_TIERS;
            return tiers.slice(1).filter(tier => options.pinnedGear[index] === null || tiers.indexOf(tier) === options.pinnedGear[index])
                .map(tier => slot === "weapon" ? tier : `${slot}${WareraOptimizer.constants.TIER_NUM[tier]}`);
        });
        try {
            const cached = JSON.parse(localStorage.getItem(ROLL_CACHE_KEY) || "null");
            if (cached && Date.now() - cached.savedAt < 15 * 60 * 1000 && cached.data?.gearStatRanges && cached.data?.gearPriceCurves
                && wanted.every(code => cached.data.gearMarketMeta?.codes?.includes(code))) return cached.data;
        } catch (_) { /* Browser storage may be unavailable. */ }
        const ranges = JSON.parse(JSON.stringify(WareraOptimizer.constants.GEAR_STAT_RANGES));
        let rangeSource = "bundled";
        try {
            const config = await fetchJson(`${API_BASE_URL}/gameConfig.getGameConfig`, apiKey);
            const items = config.result?.data?.items;
            if (items) {
                for (const slot of WareraOptimizer.constants.GEAR_SLOTS) {
                    const tiers = slot === "weapon" ? WareraOptimizer.constants.WEAPON_TIERS : WareraOptimizer.constants.GEAR_TIERS;
                    tiers.forEach((tier, index) => {
                        const code = slot === "weapon" ? tier : `${slot}${index}`;
                        const stats = items[code]?.dynamicStats;
                        if (!stats) return;
                        const mapped = Object.fromEntries(Object.entries(stats).filter(([key, value]) => STAT_KEYS[key] && Array.isArray(value) && value.length === 2
                            && value.every(Number.isInteger) && value[0] >= 0 && value[1] >= value[0]).map(([key, value]) => [STAT_KEYS[key], value]));
                        if (Object.keys(mapped).length === Object.keys(ranges[slot][tier] || {}).length) ranges[slot][tier] = mapped;
                    });
                }
                rangeSource = "live";
            }
        } catch (_) { /* Keep the verified bundled game ranges. */ }
        const jobs = WareraOptimizer.constants.GEAR_SLOTS.flatMap(slot => Object.keys(ranges[slot]).map(tier => ({
            slot, tier, code: slot === "weapon" ? tier : `${slot}${WareraOptimizer.constants.TIER_NUM[tier]}`,
        }))).filter(job => wanted.includes(job.code));
        const gearPriceCurves = {}, sampleCounts = {};
        let nextJob = 0, completed = 0, failed = 0, unavailable = false;
        // Three paginated streams; stop at 500 recent trades per item, never scan unbounded history.
        await Promise.all(Array.from({ length: 3 }, async () => {
            while (nextJob < jobs.length) {
                const job = jobs[nextJob++], rows = [];
                let cursor;
                try {
                    if (unavailable) throw new Error("Equipment history unavailable");
                    for (let page = 0; page < 5; page += 1) {
                        const input = { itemCode: job.code, transactionType: "itemMarket", limit: 100, ...(cursor ? { cursor } : {}) };
                        const response = await fetchJson(`${API_BASE_URL}/transaction.getPaginatedTransactions`, apiKey, input);
                        const payload = response.result?.data;
                        if (!Array.isArray(payload?.items)) throw new Error("Unexpected equipment transaction response");
                        rows.push(...payload.items);
                        if (!payload.nextCursor || payload.nextCursor === cursor || !payload.items.length) break;
                        cursor = payload.nextCursor;
                    }
                } catch (error) {
                    failed += 1;
                    if ([401, 403, 429].includes(error.status) || (failed >= 3 && completed === failed - 1)) unavailable = true;
                }
                const analyzed = analyzeGearTransactions(rows, ranges[job.slot][job.tier], job.code);
                (gearPriceCurves[job.slot] ||= {})[job.tier] = analyzed.curve;
                (sampleCounts[job.slot] ||= {})[job.tier] = analyzed.samples;
                completed += 1;
                if (onProgress) onProgress({ phase: "roll-prices", completed, total: jobs.length });
            }
        }));
        const data = { searchGearRolls: true, gearStatRanges: ranges, gearPriceCurves,
            gearMarketMeta: { sampleCounts, failed, rangeSource, codes: jobs.map(job => job.code), fetchedAt: new Date().toISOString() } };
        if (failed < jobs.length) {
            try { localStorage.setItem(ROLL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data })); } catch (_) {}
        }
        return data;
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

    async function fetchConsumablePrices(apiKey, options) {
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
                scrap_price: options.earningScrapEnabled ? prices[SCRAP_API_CODE] || 0.0 : 0.0,
                case1_price: options.earningCasesEnabled ? prices[CASE_API_CODE] || 0.0 : 0.0,
                case2_price: options.earningCasesEnabled ? prices[CASE2_API_CODE] || 0.0 : 0.0,
                pill_price: prices[PILL_API_CODE] || 0.0,
            },
        };
    }

    async function fetchMarketPrices(apiKey, options, onProgress) {
        try {
            if (onProgress) onProgress({ phase: "prices" });
            const [gearCosts, consumables] = await Promise.all([
                fetchEquipmentPrices(apiKey),
                fetchConsumablePrices(apiKey, options),
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

    function createOptimizerWorker(onMessage, onError) {
        const worker = new Worker(WORKER_URL);
        let ready = false;
        let closed = false;
        let pending;
        let timer;
        const terminate = () => {
            if (closed) return;
            closed = true;
            clearTimeout(timer);
            worker.terminate();
        };
        const fail = error => {
            if (closed) return;
            terminate();
            onError(error);
        };
        const armTimeout = milliseconds => {
            clearTimeout(timer);
            timer = setTimeout(() => fail(new Error("The optimizer stopped responding. Please reload the page and retry.")), milliseconds);
        };
        worker.onmessage = event => {
            if (closed) return;
            const message = event.data || {};
            if (message.type === "ready") {
                if (message.protocol !== 2) { fail(new Error("The optimizer needs a page reload to update.")); return; }
                ready = true;
                armTimeout(120000);
                if (pending) worker.postMessage(pending);
                pending = null;
                return;
            }
            armTimeout(120000);
            onMessage(message);
        };
        worker.onerror = event => fail(new Error(event.message || "Worker optimization failed"));
        worker.onmessageerror = () => fail(new Error("The optimizer could not read its worker result."));
        armTimeout(30000);
        return {
            terminate,
            postMessage: message => {
                if (ready) worker.postMessage(message);
                else pending = message;
            },
        };
    }

    function runOnMainThread(options, plan, onProgress) {
        const result = WareraOptimizer.runSearch({
            ...options,
            workerId: 0,
            sustainStart: 0,
            sustainEnd: plan.sustainCount,
        }, null, (fraction) => {
            if (onProgress) onProgress({ evaluated: fraction, total: 1, workers: 1 });
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

            function fail(error) {
                if (failed) return;
                failed = true;
                terminateAll();
                reject(error);
            }

            ranges.forEach(([sustainStart, sustainEnd], workerId) => {
                const worker = createOptimizerWorker((message) => {
                    if (message.type === "progress") {
                        progressByWorker[workerId] = Math.max(progressByWorker[workerId], Math.min(1, Math.max(0, message.fraction || 0)));
                        if (onProgress) {
                            onProgress({
                                evaluated: progressByWorker.reduce((sum, value) => sum + value, 0),
                                total: ranges.length,
                                workers: ranges.length,
                            });
                        }
                    } else if (message.type === "result") {
                        progressByWorker[workerId] = 1;
                        results[workerId] = message.result;
                        worker.terminate();
                        finished += 1;
                        if (onProgress) onProgress({ evaluated: progressByWorker.reduce((sum, value) => sum + value, 0), total: ranges.length, workers: ranges.length });
                        if (finished === ranges.length && !failed) {
                            resolve(WareraOptimizer.prepareResponse(results, options));
                        }
                    } else if (message.type === "error") {
                        fail(new Error(message.error || "Worker optimization failed"));
                    }
                }, fail);
                workers.push(worker);

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
        const priceOverrides = await fetchMarketPrices(options.apiKey, options, onProgress);
        Object.assign(priceOverrides, await fetchGearRollMarket(options.apiKey, options, onProgress));
        priceOverrides.pinnedGearRolls = options.pinnedGear.map((tierIndex, index) => tierIndex !== null && options.pinnedGearStats[index]
            ? { tierIndex, mods: options.pinnedGearStats[index] } : null);
        const runOptions = {
            ...options,
            priceOverrides,
        };
        const plan = WareraOptimizer.getSearchPlan(runOptions);
        runOptions.workers = Math.min(runOptions.workers, plan.sustainCount);
        // Every worker holds combat tables. Limit replication for the larger roll search.
        const combatBytes = plan.combatCount * (plan.budget + 1) * 96;
        const sustainBytes = plan.sustainCount * (plan.budget + 1) * 192;
        const memoryBudget = (navigator.deviceMemory && navigator.deviceMemory <= 4 ? 256 : 512) * 1024 * 1024;
        runOptions.workers = Math.max(1, Math.min(runOptions.workers, 4, Math.floor((memoryBudget - sustainBytes) / Math.max(1, combatBytes))));

        if (onProgress) {
            onProgress({
                evaluated: 0,
                total: plan.checks,
                workers: runOptions.workers,
            });
        }

        const response = await runWorkerPool(runOptions, plan, onProgress);
        if (onProgress) onProgress({ phase: "roll-refinement", completed: 0, total: response.builds.length });
        if (!global.Worker) return WareraOptimizer.refineGearRolls(response, runOptions, onProgress);
        return new Promise((resolve, reject) => {
            const worker = createOptimizerWorker(message => {
                if (message.type === "refinement-progress" && onProgress) onProgress(message.progress);
                if (message.type === "refined-result") { worker.terminate(); resolve(message.response); }
                if (message.type === "error") { worker.terminate(); reject(new Error(message.error)); }
            }, reject);
            worker.postMessage({ type: "refine", options: runOptions, response });
        });
    }

    global.WareraBrowserOptimizer = {
        run,
        parseOptimizationRequest,
        analyzeGearTransactions,
    };
})(window);
