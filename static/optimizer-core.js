(function (global) {
    "use strict";

    const BASELINE = {
        atk: 100,
        prc: 50,
        critc: 10,
        critd: 100,
        arm: 0,
        ddg: 0,
        hp: 100,
        hun: 4,
        loot: 2,
    };

    const SKILL_POINTS_PER_LEVEL = 4;
    const MAX_SKILL_LEVEL = 10;
    const HEALTH_RECOVERY_RATE_PER_HOUR = 0.10;
    const HUNGER_RECOVERY_RATE_PER_HOUR = 0.10;
    const HOURS_PER_DAY = 24;
    const SKILL_LEVEL_COST = Array.from({ length: MAX_SKILL_LEVEL + 1 }, (_, lvl) => lvl * (lvl + 1) / 2);

    const FOOD = {
        noFood: { regen_bonus: 0, health_pct: 0.0, food_multiplier: 0, cost: 0.0 },
        bread: { regen_bonus: 10, health_pct: 0.1, food_multiplier: 1, cost: 1.7 },
        steak: { regen_bonus: 20, health_pct: 0.15, food_multiplier: 2, cost: 3.7 },
        cookedFish: { regen_bonus: 30, health_pct: 0.20, food_multiplier: 3, cost: 7.6 },
    };
    const FOOD_NAMES = Object.keys(FOOD);

    const AMMO = {
        noAmmo: { dmg_bonus: 0.0, bullet_cost: 0.0 },
        lightAmmo: { dmg_bonus: 0.1, bullet_cost: 0.2 },
        ammo: { dmg_bonus: 0.2, bullet_cost: 0.7 },
        heavyAmmo: { dmg_bonus: 0.4, bullet_cost: 2.7 },
    };
    const AMMO_NAMES = Object.keys(AMMO);

    const AMMO_API_MAPPING = {
        green: "lightAmmo",
        blue: "ammo",
        purple: "heavyAmmo",
    };

    const SCRAP_API_CODE = "scraps";
    const CASE_API_CODE = "case1";
    const CASE2_API_CODE = "case2";
    const PILL_API_CODE = "cocain";

    const GEAR_SLOTS = ["weapon", "helmet", "gloves", "chest", "pants", "boots"];
    const GEAR_TIERS = ["none", "grey", "green", "blue", "purple", "gold", "red"];
    const WEAPON_TIERS = ["none", "knife", "gun", "rifle", "sniper", "tank", "jet"];

    const TIER_NUM = {
        none: 0,
        grey: 1,
        green: 2,
        blue: 3,
        purple: 4,
        gold: 5,
        red: 6,
    };

    const GEAR = {
        weapon: {
            none: { mods: {}, cost: 0, scrap: 0 },
            knife: { mods: { atk: 36, critc: 5 }, cost: 2, scrap: 6 },
            gun: { mods: { atk: 68, critc: 9 }, cost: 8, scrap: 18 },
            rifle: { mods: { atk: 86, critc: 14 }, cost: 27, scrap: 54 },
            sniper: { mods: { atk: 121, critc: 18 }, cost: 70, scrap: 162 },
            tank: { mods: { atk: 160, critc: 32 }, cost: 200, scrap: 486 },
            jet: { mods: { atk: 275, critc: 45 }, cost: 650, scrap: 1458 },
        },
        helmet: {
            none: { mods: {}, cost: 0, scrap: 0 },
            grey: { mods: { critd: 15 }, cost: 2, scrap: 6 },
            green: { mods: { critd: 28 }, cost: 7, scrap: 18 },
            blue: { mods: { critd: 45 }, cost: 27, scrap: 54 },
            purple: { mods: { critd: 82 }, cost: 70, scrap: 162 },
            gold: { mods: { critd: 105 }, cost: 210, scrap: 486 },
            red: { mods: { critd: 142 }, cost: 650, scrap: 1458 },
        },
        gloves: {
            none: { mods: {}, cost: 0, scrap: 0 },
            grey: { mods: { prc: 5 }, cost: 2, scrap: 6 },
            green: { mods: { prc: 9 }, cost: 7, scrap: 18 },
            blue: { mods: { prc: 14 }, cost: 27, scrap: 54 },
            purple: { mods: { prc: 23 }, cost: 70, scrap: 162 },
            gold: { mods: { prc: 36 }, cost: 210, scrap: 486 },
            red: { mods: { prc: 55 }, cost: 650, scrap: 1458 },
        },
        chest: {
            none: { mods: {}, cost: 0, scrap: 0 },
            grey: { mods: { arm: 5 }, cost: 2, scrap: 6 },
            green: { mods: { arm: 9 }, cost: 7, scrap: 18 },
            blue: { mods: { arm: 14 }, cost: 27, scrap: 54 },
            purple: { mods: { arm: 27 }, cost: 70, scrap: 162 },
            gold: { mods: { arm: 45 }, cost: 240, scrap: 486 },
            red: { mods: { arm: 65 }, cost: 650, scrap: 1458 },
        },
        pants: {
            none: { mods: {}, cost: 0, scrap: 0 },
            grey: { mods: { arm: 5 }, cost: 2, scrap: 6 },
            green: { mods: { arm: 9 }, cost: 7, scrap: 18 },
            blue: { mods: { arm: 14 }, cost: 27, scrap: 54 },
            purple: { mods: { arm: 27 }, cost: 70, scrap: 162 },
            gold: { mods: { arm: 45 }, cost: 240, scrap: 486 },
            red: { mods: { arm: 65 }, cost: 650, scrap: 1458 },
        },
        boots: {
            none: { mods: {}, cost: 0, scrap: 0 },
            grey: { mods: { ddg: 5 }, cost: 2, scrap: 6 },
            green: { mods: { ddg: 9 }, cost: 7, scrap: 18 },
            blue: { mods: { ddg: 14 }, cost: 27, scrap: 54 },
            purple: { mods: { ddg: 23 }, cost: 70, scrap: 162 },
            gold: { mods: { ddg: 36 }, cost: 240, scrap: 486 },
            red: { mods: { ddg: 55 }, cost: 650, scrap: 1458 },
        },
    };

    function cloneJson(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function createModelContext(priceOverrides) {
        const ctx = {
            food: cloneJson(FOOD),
            ammo: cloneJson(AMMO),
            gear: cloneJson(GEAR),
            rewards: {
                scrap_price: 0.0,
                case1_price: 0.0,
                case2_price: 0.0,
                pill_price: 0.0,
            },
            gearCache: new Map(),
        };

        const overrides = priceOverrides || {};
        if (overrides.foodCosts) {
            for (const [name, price] of Object.entries(overrides.foodCosts)) {
                if (ctx.food[name] && Number.isFinite(price) && price >= 0) {
                    ctx.food[name].cost = price;
                }
            }
        }
        if (overrides.ammoCosts) {
            for (const [name, price] of Object.entries(overrides.ammoCosts)) {
                if (ctx.ammo[name] && Number.isFinite(price) && price >= 0) {
                    ctx.ammo[name].bullet_cost = price;
                }
            }
        }
        if (overrides.gearCosts) {
            for (const [slot, tiers] of Object.entries(overrides.gearCosts)) {
                if (!ctx.gear[slot]) continue;
                for (const [tier, price] of Object.entries(tiers || {})) {
                    if (ctx.gear[slot][tier] && Number.isFinite(price) && price >= 0) {
                        ctx.gear[slot][tier].cost = price;
                    }
                }
            }
        }
        if (overrides.rewards) {
            for (const key of Object.keys(ctx.rewards)) {
                const price = overrides.rewards[key];
                if (Number.isFinite(price) && price >= 0) {
                    ctx.rewards[key] = price;
                }
            }
        }

        return ctx;
    }

    function makeSkillTables(baseline) {
        const tables = Array.from({ length: 9 }, () => Array(MAX_SKILL_LEVEL + 1));
        for (let lvl = 0; lvl <= MAX_SKILL_LEVEL; lvl += 1) {
            tables[0][lvl] = baseline.atk + 25 * lvl;
            tables[1][lvl] = baseline.prc / 100 + 0.05 * lvl;
            tables[2][lvl] = baseline.critc / 100 + 0.05 * lvl;
            tables[3][lvl] = baseline.critd / 100 + 0.20 * lvl;
            tables[4][lvl] = baseline.arm + 6 * lvl;
            tables[5][lvl] = baseline.ddg + 4 * lvl;
            tables[6][lvl] = baseline.hp + 10 * lvl;
            tables[7][lvl] = baseline.hun + lvl;
            tables[8][lvl] = baseline.loot / 100 + 0.01 * lvl;
        }
        return tables;
    }

    function gearTier(gearIdx, index) {
        const slot = GEAR_SLOTS[index];
        return slot === "weapon" ? WEAPON_TIERS[gearIdx[index]] : GEAR_TIERS[gearIdx[index]];
    }

    function applyGearToBaseline(gearIdx, ctx) {
        const out = { ...BASELINE };
        for (let i = 0; i < GEAR_SLOTS.length; i += 1) {
            const slot = GEAR_SLOTS[i];
            const tier = gearTier(gearIdx, i);
            const data = ctx.gear[slot][tier];
            for (const [stat, delta] of Object.entries(data.mods)) {
                out[stat] = (out[stat] || 0) + delta;
            }
        }
        return out;
    }

    function tablesForGear(gearIdx, ctx) {
        const key = gearIdx.join(",");
        let tables = ctx.gearCache.get(key);
        if (!tables) {
            tables = makeSkillTables(applyGearToBaseline(gearIdx, ctx));
            ctx.gearCache.set(key, tables);
        }
        return tables;
    }

    function attacksPossible(hp, hun, armor, dodge, food, pillMode) {
        const hours = pillMode ? 18 : HOURS_PER_DAY;
        const regenBase = hp * HEALTH_RECOVERY_RATE_PER_HOUR * hours;
        const pctByFoodMultiplier = { 1: 10, 2: 15, 3: 20 };
        const foodBonus = ((pctByFoodMultiplier[food.food_multiplier] || 0) / 100) * hp;
        const regenAll = regenBase + hun * HUNGER_RECOVERY_RATE_PER_HOUR * hours * foodBonus;
        const costPerAttack = 10 * (1 - armor / (armor + 40)) * (1 - dodge / (dodge + 40));
        return Math.max(0.0, regenAll / Math.max(1e-9, costPerAttack));
    }

    function skillCost(skillLevels) {
        let total = 0;
        for (let i = 0; i < skillLevels.length; i += 1) {
            total += SKILL_LEVEL_COST[skillLevels[i]];
        }
        return total;
    }

    function computeTotals(skillLevels, gearIdx, ammoIdx, foodIdx, options, ctx) {
        const tables = tablesForGear(gearIdx, ctx);
        let atk = tables[0][skillLevels[0]];
        const prcRaw = tables[1][skillLevels[1]];
        const critcRaw = tables[2][skillLevels[2]];
        let critd = tables[3][skillLevels[3]];
        const arm = tables[4][skillLevels[4]];
        const ddg = tables[5][skillLevels[5]];
        const hp = tables[6][skillLevels[6]];
        const hun = tables[7][skillLevels[7]];
        const loot = 0.02 + 0.02 * skillLevels[8];

        const skillStatsRaw = [
            atk,
            prcRaw * 100,
            critcRaw * 100,
            critd * 100,
            arm,
            ddg,
            hp,
            hun,
            loot * 100,
        ];

        const overflowMultiplier = 4.0;
        const prcOverflowPct = Math.max(0.0, (prcRaw - 1.0) * 100) * overflowMultiplier;
        const critcOverflowPct = Math.max(0.0, (critcRaw - 1.0) * 100) * overflowMultiplier;

        atk += prcOverflowPct;
        critd += critcOverflowPct * 0.01;

        const prc = Math.min(1.0, prcRaw);
        const critc = Math.min(1.0, critcRaw);
        const ammo = ctx.ammo[AMMO_NAMES[ammoIdx]];
        const food = ctx.food[FOOD_NAMES[foodIdx]];
        const pillBonus = options.pill ? 1.6 : 1.0;

        atk *= pillBonus * (1.0 + ammo.dmg_bonus) * options.rankBonus;

        const dmgPerAttack = atk * prc * (1 + critc * critd) + (atk / 2.0) * (1 - prc);
        const nAttacks = attacksPossible(hp, hun, arm, ddg, food, options.pill);
        const casesPerDay = loot * nAttacks * prc;
        const eliteCasesPerDay = (loot / 100) * nAttacks * prc;

        let gearCostTotal = 0.0;
        for (let i = 0; i < GEAR_SLOTS.length; i += 1) {
            const slot = GEAR_SLOTS[i];
            const tier = gearTier(gearIdx, i);
            const decayMultiplier = slot === "weapon" ? 1 : (1 - ddg / (ddg + 40));
            gearCostTotal += (ctx.gear[slot][tier].cost / 100) * nAttacks * decayMultiplier;
        }

        const dayMultiplier = options.pill ? 1.8 : 2.4;
        const foodCost = food.cost * hun * dayMultiplier;
        const ammoCost = ammo.bullet_cost * nAttacks;
        const pillCost = options.pill ? ctx.rewards.pill_price : 0.0;
        const totalCost = gearCostTotal + foodCost + ammoCost + pillCost;
        const totalDamage = dmgPerAttack * nAttacks;

        return {
            totalDamage,
            totalCost,
            diag: {
                atk,
                prc,
                critc,
                critd,
                arm,
                ddg,
                hp,
                hun,
                loot: loot * 100,
                dmg_per_attack: dmgPerAttack,
                n_attacks: nAttacks,
                cases_per_day: casesPerDay,
                elite_cases_per_day: eliteCasesPerDay,
                gear_cost: gearCostTotal,
                food_cost: foodCost,
                ammo_bullet_cost: ammoCost,
                pill_cost: pillCost,
                skill_stats: skillStatsRaw,
            },
        };
    }

    function gearDecayQuantityFromDiag(gearIdx, slot, diag) {
        const dodge = diag.ddg;
        const attacks = diag.n_attacks;
        const decayMultiplier = slot === "weapon" ? 1.0 : 1.0 - dodge / (dodge + 40);
        return Math.round((attacks * decayMultiplier / 100) * 100) / 100;
    }

    function calculateScrapGeneratedFromDiag(gearIdx, diag, ctx) {
        let totalScrap = 0.0;
        for (let i = 0; i < GEAR_SLOTS.length; i += 1) {
            const slot = GEAR_SLOTS[i];
            const tier = gearTier(gearIdx, i);
            const quantity = Math.max(0.01, gearDecayQuantityFromDiag(gearIdx, slot, diag));
            totalScrap += (ctx.gear[slot][tier].scrap / 3) * quantity;
        }
        return totalScrap;
    }

    function computeEconomics(skillLevels, gearIdx, totalCost, diag, ctx) {
        const totalScrapGenerated = calculateScrapGeneratedFromDiag(gearIdx, diag, ctx);
        const loot = 0.02 + 0.02 * skillLevels[8];
        const casesPerDay = loot * diag.n_attacks * diag.prc;
        const eliteCasesPerDay = (loot / 100) * diag.n_attacks * diag.prc;
        const caseValue = casesPerDay * ctx.rewards.case1_price;
        const eliteCaseValue = eliteCasesPerDay * ctx.rewards.case2_price;
        const monetaryValueFromScrap = totalScrapGenerated * ctx.rewards.scrap_price;

        return {
            total_scrap_generated: totalScrapGenerated,
            monetary_value_from_scrap: monetaryValueFromScrap,
            cases_per_day: casesPerDay,
            elite_cases_per_day: eliteCasesPerDay,
            case_value: caseValue,
            elite_case_value: eliteCaseValue,
            net_cost: totalCost - monetaryValueFromScrap - caseValue - eliteCaseValue,
        };
    }

    function mulberry32(seed) {
        let value = seed >>> 0;
        return function () {
            value += 0x6D2B79F5;
            let t = value;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function randomInt(rand, maxExclusive) {
        return Math.floor(rand() * maxExclusive);
    }

    function randomSkillLevels(rand, skillPoints) {
        const skillLevels = Array(9).fill(0);
        let remaining = Math.max(0, Math.floor(skillPoints));

        for (let step = 0; step < 90; step += 1) {
            const possible = [];
            for (let i = 0; i < skillLevels.length; i += 1) {
                if (skillLevels[i] >= MAX_SKILL_LEVEL) continue;
                const nextLevel = skillLevels[i] + 1;
                const delta = SKILL_LEVEL_COST[nextLevel] - SKILL_LEVEL_COST[skillLevels[i]];
                if (delta <= remaining) {
                    possible.push([i, delta]);
                }
            }
            if (!possible.length) break;
            if (step > 0 && rand() < 0.045) break;

            const [skillIndex, costDelta] = possible[randomInt(rand, possible.length)];
            skillLevels[skillIndex] += 1;
            remaining -= costDelta;
        }

        return skillLevels;
    }

    function randomGear(rand) {
        return [
            randomInt(rand, WEAPON_TIERS.length),
            randomInt(rand, GEAR_TIERS.length),
            randomInt(rand, GEAR_TIERS.length),
            randomInt(rand, GEAR_TIERS.length),
            randomInt(rand, GEAR_TIERS.length),
            randomInt(rand, GEAR_TIERS.length),
        ];
    }

    function randomCandidate(rand, skillPoints) {
        const skillLevels = randomSkillLevels(rand, skillPoints);
        const gearIdx = randomGear(rand);
        const weaponIdx = gearIdx[0];
        const ammoIdx = weaponIdx <= 1 ? 0 : 1 + randomInt(rand, AMMO_NAMES.length - 1);
        const foodIdx = randomInt(rand, FOOD_NAMES.length);
        return { skillLevels, gearIdx, ammoIdx, foodIdx };
    }

    function metricBin(primary, objective) {
        const scale = objective === "cases" ? 0.25 : 10000;
        return Math.max(0, Math.min(2047, Math.floor(primary / scale)));
    }

    function rawBuildKey(build) {
        return [
            build.skill_lvls.join(","),
            build.gear_idx.join(","),
            build.ammo_idx,
            build.food_idx,
        ].join("|");
    }

    function createRawBuild(candidate, totals, econ, selectionScore) {
        return {
            skill_lvls: candidate.skillLevels.slice(),
            gear_idx: candidate.gearIdx.slice(),
            ammo_idx: candidate.ammoIdx,
            food_idx: candidate.foodIdx,
            total_damage: totals.totalDamage,
            total_cost: totals.totalCost,
            skill_cost: skillCost(candidate.skillLevels),
            diag: totals.diag,
            total_scrap_generated: econ.total_scrap_generated,
            monetary_value_from_scrap: econ.monetary_value_from_scrap,
            cases_per_day: econ.cases_per_day,
            elite_cases_per_day: econ.elite_cases_per_day,
            case_value: econ.case_value,
            elite_case_value: econ.elite_case_value,
            net_cost: econ.net_cost,
            _selection_score: selectionScore,
        };
    }

    function runSearch(options, onProgress) {
        const ctx = createModelContext(options.priceOverrides);
        const iterations = Math.max(1, Math.floor(options.iterations || 100000));
        const skillPoints = Math.max(0, Math.floor(options.adjustedLevel * SKILL_POINTS_PER_LEVEL));
        const rand = mulberry32(options.seed || 1);
        const bins = new Map();
        const progressEvery = Math.max(1000, Math.floor(iterations / 100));
        let bestDamageBuild = null;
        let bestMoneyBuild = null;
        let bestMetricBuild = null;

        for (let i = 0; i < iterations; i += 1) {
            const candidate = randomCandidate(rand, skillPoints);
            const totals = computeTotals(candidate.skillLevels, candidate.gearIdx, candidate.ammoIdx, candidate.foodIdx, options, ctx);
            const econ = computeEconomics(candidate.skillLevels, candidate.gearIdx, totals.totalCost, totals.diag, ctx);
            const primary = options.objective === "cases" ? econ.cases_per_day : totals.totalDamage;
            if (!Number.isFinite(primary) || primary <= 0) continue;

            const scoreDenominator = Math.max(primary, options.objective === "cases" ? 0.001 : 1);
            const selectionScore = econ.net_cost / scoreDenominator;
            const bin = metricBin(primary, options.objective);
            const current = bins.get(bin);
            const shouldKeepBin = !current || selectionScore < current._selection_score;
            const shouldKeepDamage = !bestDamageBuild || totals.totalDamage > bestDamageBuild.total_damage;
            const shouldKeepMoney = !bestMoneyBuild || econ.net_cost < bestMoneyBuild.net_cost;
            const shouldKeepMetric = !bestMetricBuild || primary > (options.objective === "cases" ? bestMetricBuild.cases_per_day : bestMetricBuild.total_damage);

            if (shouldKeepBin || shouldKeepDamage || shouldKeepMoney || shouldKeepMetric) {
                const raw = createRawBuild(candidate, totals, econ, selectionScore);
                if (shouldKeepBin) bins.set(bin, raw);
                if (shouldKeepDamage) bestDamageBuild = raw;
                if (shouldKeepMoney) bestMoneyBuild = raw;
                if (shouldKeepMetric) bestMetricBuild = raw;
            }

            if (onProgress && (i + 1) % progressEvery === 0) {
                onProgress(i + 1);
            }
        }

        if (onProgress) onProgress(iterations);

        const unique = new Map();
        for (const build of bins.values()) unique.set(rawBuildKey(build), build);
        for (const build of [bestDamageBuild, bestMoneyBuild, bestMetricBuild]) {
            if (build) unique.set(rawBuildKey(build), build);
        }

        return {
            builds: Array.from(unique.values()),
            evaluated: iterations,
        };
    }

    function getTierColor(tier) {
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
        };
        return colors[String(tier).toLowerCase()] || "rgb(58, 71, 83)";
    }

    function getConsumableColor(name) {
        const normalized = String(name).toLowerCase();
        if (normalized.includes("light") || normalized.includes("bread")) return "rgb(33, 88, 53)";
        if (normalized.includes("heavy") || normalized.includes("fish")) return "rgb(68, 46, 102)";
        if (normalized.includes("ammo") || normalized.includes("steak")) return "rgb(27, 54, 114)";
        return "rgb(58, 71, 83)";
    }

    function formatNumber(num) {
        if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
        if (num > 1000) return `${(num / 1000).toFixed(1)}K`;
        return Number(num).toFixed(2);
    }

    function ammoQuantity(build) {
        if (AMMO_NAMES[build.ammo_idx] === "noAmmo") return 0;
        return Math.ceil(build.diag.n_attacks);
    }

    function foodQuantity(build, pill) {
        if (FOOD_NAMES[build.food_idx] === "noFood") return 0;
        const dayMultiplier = pill ? 1.8 : 2.4;
        const hungerDays = build.diag.hun * dayMultiplier;
        return pill ? Math.floor(hungerDays) : Math.ceil(hungerDays);
    }

    function gearEntries(build, ctx) {
        return GEAR_SLOTS.map((slot, index) => {
            const tier = gearTier(build.gear_idx, index);
            const imageName = slot === "weapon" ? tier : slot;
            const quantity = Math.max(0.01, gearDecayQuantityFromDiag(build.gear_idx, slot, build.diag));
            return {
                tier,
                image_name: imageName,
                slot,
                quantity,
                is_none: tier === "none",
                color: getTierColor(tier),
            };
        });
    }

    function finalizeBuild(rawBuild, pill, ctx) {
        const build = {
            ...rawBuild,
            skill_lvls: rawBuild.skill_lvls.slice(),
            gear_idx: rawBuild.gear_idx.slice(),
        };
        delete build._selection_score;

        build.ammo_name = AMMO_NAMES[build.ammo_idx];
        build.food_name = FOOD_NAMES[build.food_idx];
        build.ammo_quantity = ammoQuantity(build);
        build.food_quantity = foodQuantity(build, pill);
        build.gear = gearEntries(build, ctx);
        build.ammo_color = getConsumableColor(build.ammo_name);
        build.food_color = getConsumableColor(build.food_name);
        build.total_damage_formatted = formatNumber(build.total_damage);
        build.total_cost_formatted = formatNumber(build.total_cost);
        build.total_scrap_generated_formatted = formatNumber(build.total_scrap_generated);
        build.monetary_value_from_scrap_formatted = formatNumber(build.monetary_value_from_scrap);
        build.case_value_formatted = formatNumber(build.case_value);
        build.cases_per_day_formatted = formatNumber(build.cases_per_day);
        build.elite_case_value_formatted = formatNumber(build.elite_case_value);
        build.elite_cases_per_day_formatted = formatNumber(build.elite_cases_per_day);
        build.net_cost_formatted = formatNumber(build.net_cost);
        return build;
    }

    function linspace(start, stop, count) {
        if (count <= 1) return [start];
        const step = (stop - start) / (count - 1);
        return Array.from({ length: count }, (_, i) => start + step * i);
    }

    function selectBuilds(details, options) {
        const metric = options.metric || "damage";
        const costKey = options.costKey || "net_cost";
        const numBuilds = options.numBuilds || 19;

        if (metric === "cases") {
            const filtered = details.filter((build) => build.cases_per_day > 0);
            if (!filtered.length) return [];
            const values = filtered.map((build) => build.cases_per_day);
            const minVal = Math.min(...values);
            const maxVal = Math.max(...values);
            if (minVal === maxVal) return filtered.slice(0, 1);
            const bands = linspace(minVal, maxVal, numBuilds + 1);
            const selected = [];
            for (let i = 0; i < numBuilds; i += 1) {
                const inBand = filtered.filter((build) => bands[i] <= build.cases_per_day && build.cases_per_day < bands[i + 1]);
                if (inBand.length) {
                    selected.push(inBand.reduce((best, build) => {
                        const score = build[costKey] > 0 ? build.cases_per_day / build[costKey] : Number.POSITIVE_INFINITY;
                        const bestScore = best[costKey] > 0 ? best.cases_per_day / best[costKey] : Number.POSITIVE_INFINITY;
                        return score > bestScore ? build : best;
                    }));
                }
            }
            return selected;
        }

        const minDamage = options.minDamage || 50000;
        const maxDamage = options.maxDamage || 5000000;
        let filtered = details.filter((build) => minDamage <= build.total_damage && build.total_damage <= maxDamage);
        if (!filtered.length) {
            filtered = details.slice().sort((a, b) => b.total_damage - a.total_damage).slice(0, numBuilds);
        }
        const bands = linspace(minDamage, maxDamage, numBuilds + 1);
        const selected = [];
        for (let i = 0; i < numBuilds; i += 1) {
            const inBand = filtered.filter((build) => bands[i] <= build.total_damage && build.total_damage < bands[i + 1]);
            if (inBand.length) {
                selected.push(inBand.reduce((best, build) => {
                    const score = build[costKey] > 0 ? build.total_damage / build[costKey] : Number.POSITIVE_INFINITY;
                    const bestScore = best[costKey] > 0 ? best.total_damage / best[costKey] : Number.POSITIVE_INFINITY;
                    return score > bestScore ? build : best;
                }));
            }
        }
        return selected.length ? selected : filtered.slice(0, numBuilds);
    }

    function prepareResponse(workerResults, options) {
        const ctx = createModelContext(options.priceOverrides);
        const unique = new Map();
        for (const result of workerResults) {
            for (const build of result.builds || []) {
                const key = rawBuildKey(build);
                const existing = unique.get(key);
                if (!existing || build.net_cost < existing.net_cost) {
                    unique.set(key, build);
                }
            }
        }

        const allBuilds = Array.from(unique.values())
            .map((build) => finalizeBuild(build, options.pill, ctx))
            .sort((a, b) => a.total_cost - b.total_cost || b.total_damage - a.total_damage);

        if (!allBuilds.length) {
            return {
                builds: [],
                all_builds: [],
                max_damage_value: 0,
                max_net_cost_value: 0,
            };
        }

        const maxDamageBuild = allBuilds.reduce((best, build) => build.total_damage > best.total_damage ? build : best);
        maxDamageBuild.is_highest_damage = true;
        maxDamageBuild.is_max_damage = true;
        const maxDamageValue = Math.floor(maxDamageBuild.total_damage);

        let builds = selectBuilds(allBuilds, {
            minDamage: 50000,
            maxDamage: maxDamageValue,
            numBuilds: 19,
            costKey: "net_cost",
            metric: options.objective,
        }).sort((a, b) => a.total_cost - b.total_cost);

        if (options.objective === "cases") {
            const bestMoneyBuild = allBuilds.reduce((best, build) => build.net_cost < best.net_cost ? build : best);
            bestMoneyBuild.is_highest_damage = true;
            const bestMoneyKey = rawBuildKey(bestMoneyBuild);
            builds = builds.filter((build) => rawBuildKey(build) !== bestMoneyKey);
            builds.unshift(bestMoneyBuild);
        } else {
            const maxDamageKey = rawBuildKey(maxDamageBuild);
            builds = builds.filter((build) => rawBuildKey(build) !== maxDamageKey);
            builds.push(maxDamageBuild);
        }

        return {
            builds,
            all_builds: allBuilds,
            max_damage_value: maxDamageValue,
            max_net_cost_value: maxDamageBuild.net_cost,
        };
    }

    global.WareraOptimizer = {
        constants: {
            SKILL_POINTS_PER_LEVEL,
            SKILL_LEVEL_COST,
            FOOD_NAMES,
            AMMO_NAMES,
            AMMO_API_MAPPING,
            SCRAP_API_CODE,
            CASE_API_CODE,
            CASE2_API_CODE,
            PILL_API_CODE,
            GEAR_SLOTS,
            GEAR_TIERS,
            WEAPON_TIERS,
            TIER_NUM,
        },
        createModelContext,
        computeTotals,
        runSearch,
        prepareResponse,
        formatNumber,
    };
})(typeof globalThis !== "undefined" ? globalThis : this);
