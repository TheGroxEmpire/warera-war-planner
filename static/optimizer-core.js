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
    const DAMAGE_SKILL_COUNT = 4;
    const SUSTAIN_SKILL_COUNT = 4;
    const MAX_DAMAGE_SKILL_BUDGET = DAMAGE_SKILL_COUNT * SKILL_LEVEL_COST[MAX_SKILL_LEVEL];
    const MAX_SUSTAIN_SKILL_BUDGET = SUSTAIN_SKILL_COUNT * SKILL_LEVEL_COST[MAX_SKILL_LEVEL];
    const MAX_LOOT_SKILL_BUDGET = SKILL_LEVEL_COST[MAX_SKILL_LEVEL];
    const MAX_OPTIMIZED_SKILL_BUDGET = MAX_DAMAGE_SKILL_BUDGET + MAX_SUSTAIN_SKILL_BUDGET + MAX_LOOT_SKILL_BUDGET;

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

    // Verified against gameConfig.getGameConfig on 2026-10-05; refreshed per browser run.
    const GEAR_STAT_RANGES = {"weapon":{"knife":{"atk":[21,40],"critc":[1,5]},"gun":{"atk":[51,60],"critc":[6,10]},"rifle":{"atk":[71,90],"critc":[11,15]},"sniper":{"atk":[101,130],"critc":[16,20]},"tank":{"atk":[141,170],"critc":[26,35]},"jet":{"atk":[221,300],"critc":[41,50]}},"helmet":{"grey":{"critd":[1,15]},"green":{"critd":[16,30]},"blue":{"critd":[31,50]},"purple":{"critd":[71,90]},"gold":{"critd":[91,110]},"red":{"critd":[121,150]}},"gloves":{"grey":{"prc":[1,5]},"green":{"prc":[6,10]},"blue":{"prc":[11,15]},"purple":{"prc":[21,25]},"gold":{"prc":[31,40]},"red":{"prc":[51,60]}},"chest":{"grey":{"arm":[1,5]},"green":{"arm":[6,10]},"blue":{"arm":[11,15]},"purple":{"arm":[21,30]},"gold":{"arm":[36,50]},"red":{"arm":[56,70]}},"pants":{"grey":{"arm":[1,5]},"green":{"arm":[6,10]},"blue":{"arm":[11,15]},"purple":{"arm":[21,30]},"gold":{"arm":[36,50]},"red":{"arm":[56,70]}},"boots":{"grey":{"ddg":[1,5]},"green":{"ddg":[6,10]},"blue":{"ddg":[11,15]},"purple":{"ddg":[21,25]},"gold":{"ddg":[31,40]},"red":{"ddg":[51,60]}}};

    function cloneJson(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function rollQuality(mods, ranges) {
        const values = Object.entries(ranges).map(([stat, [min, max]]) => (
            max === min ? 1 : Math.max(0, Math.min(1, (mods[stat] - min) / (max - min)))
        ));
        return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    }

    function interpolateRollPrice(curve, quality, fallback) {
        const points = (curve || []).filter(point => Number.isFinite(point.quality)
            && Number.isFinite(point.price) && point.price > 0).slice().sort((a, b) => a.quality - b.quality);
        if (!points.length) return fallback;
        if (quality <= points[0].quality) return points[0].price;
        for (let index = 1; index < points.length; index += 1) {
            if (quality <= points[index].quality) {
                const left = points[index - 1], right = points[index];
                const fraction = (quality - left.quality) / Math.max(1e-9, right.quality - left.quality);
                return left.price + fraction * (right.price - left.price);
            }
        }
        return points[points.length - 1].price;
    }

    function gearAt(ctx, slot, index) {
        return ctx.gearChoices[slot][index];
    }

    function gearChoiceAllowed(ctx, options, slot, index) {
        const slotIndex = GEAR_SLOTS.indexOf(slot);
        const pin = pinnedArray(options, "pinnedGear", 6)[slotIndex];
        const choice = gearAt(ctx, slot, index);
        if (pin !== null && choice.tierIndex !== pin) return false;
        const mods = options.pinnedGearStats && options.pinnedGearStats[slotIndex];
        if ((choice.dominated || choice.gridExcluded) && !mods) return false;
        return !mods || Object.entries(mods).every(([stat, value]) => choice.mods[stat] === value);
    }

    function configureGearChoices(ctx, overrides) {
        ctx.gearChoices = {};
        ctx.rollRanges = overrides.gearStatRanges || GEAR_STAT_RANGES;
        ctx.rollCurves = overrides.gearPriceCurves || {};
        ctx.rollSearch = Boolean(overrides.searchGearRolls);
        for (const slot of GEAR_SLOTS) {
            const tiers = slot === "weapon" ? WEAPON_TIERS : GEAR_TIERS;
            // Keep the first seven indexes stable for legacy simulation calls.
            ctx.gearChoices[slot] = tiers.map((tier, tierIndex) => ({
                ...cloneJson(ctx.gear[slot][tier]), tier, tierIndex,
            }));
            if (!ctx.rollSearch) continue;
            const extras = [];
            tiers.forEach((tier, tierIndex) => {
                if (!tierIndex) return;
                const ranges = ctx.rollRanges[slot] && ctx.rollRanges[slot][tier];
                if (!ranges || !Object.keys(ranges).length) return;
                const base = ctx.gearChoices[slot][tierIndex];
                base.mods = Object.fromEntries(Object.entries(ranges).map(([stat, [min, max]]) => [stat, Math.round((min + max) / 2)]));
                const curve = ctx.rollCurves[slot] && ctx.rollCurves[slot][tier];
                base.cost = interpolateRollPrice(curve, rollQuality(base.mods, ranges), base.cost);
                base.priceSource = curve && curve.length >= 2 ? "transaction-curve" : "tier-average";
                if (!curve || curve.length < 2) return;
                base.gridExcluded = true;
                // Broad endpoint grid; the final pass refines integer rolls between endpoints.
                let rolls = [{}];
                for (const [stat, [min, max]] of Object.entries(ranges)) {
                    rolls = rolls.flatMap(mods => [...new Set([min, max])].map(value => ({ ...mods, [stat]: value })));
                }
                for (const mods of rolls) {
                    const quality = rollQuality(mods, ranges);
                    const cost = interpolateRollPrice(curve, quality, ctx.gear[slot][tier].cost);
                    extras.push({ ...base, mods, cost, gridExcluded: false });
                }
            });
            ctx.gearChoices[slot].push(...extras);
            const pin = overrides.pinnedGearRolls && overrides.pinnedGearRolls[GEAR_SLOTS.indexOf(slot)];
            if (pin && tiers[pin.tierIndex] && pin.tierIndex > 0) {
                const base = ctx.gearChoices[slot][pin.tierIndex];
                const ranges = ctx.rollRanges[slot][base.tier];
                const mods = Object.fromEntries(Object.entries(ranges).map(([stat, [min, max]]) => {
                    const value = pin.mods[stat];
                    // Existing items can retain legacy rolls outside today's drop range.
                    if (!Number.isInteger(value) || value < 0 || value > 10000) throw new Error(`Pinned ${slot} ${stat} must be a valid stat value.`);
                    return [stat, value];
                }));
                ctx.gearChoices[slot].push({ ...base, mods, gridExcluded: false,
                    cost: interpolateRollPrice(ctx.rollCurves[slot]?.[base.tier], rollQuality(mods, ranges), ctx.gear[slot][base.tier].cost) });
            }
            // Safe within-tier dominance: no more expensive, no weaker stat, same scrap.
            ctx.gearChoices[slot].forEach((choice, index, choices) => {
                choice.dominated = choices.some((other, otherIndex) => otherIndex !== index
                    && !other.gridExcluded && other.tierIndex === choice.tierIndex && other.cost <= choice.cost
                    && Object.keys(choice.mods).every(stat => other.mods[stat] >= choice.mods[stat])
                    && (other.cost < choice.cost || Object.keys(choice.mods).some(stat => other.mods[stat] > choice.mods[stat])
                        || otherIndex < index));
            });
        }
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

        configureGearChoices(ctx, overrides);
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

    function gearTier(gearIdx, index, ctx) {
        const slot = GEAR_SLOTS[index];
        return ctx.gearChoices[slot][gearIdx[index]].tier;
    }

    function applyGearToBaseline(gearIdx, ctx) {
        const out = { ...BASELINE };
        for (let i = 0; i < GEAR_SLOTS.length; i += 1) {
            const slot = GEAR_SLOTS[i];
            const tier = gearTier(gearIdx, i, ctx);
            const data = gearAt(ctx, slot, gearIdx[i]);
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
            if (ctx.gearCache.size >= 1024) ctx.gearCache.clear();
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
            const tier = gearTier(gearIdx, i, ctx);
            const decayMultiplier = slot === "weapon" ? 1 : (1 - ddg / (ddg + 40));
            gearCostTotal += (gearAt(ctx, slot, gearIdx[i]).cost / 100) * nAttacks * decayMultiplier;
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

    function gearDecayQuantity(attacks, decayMultiplier) {
        return Math.round((attacks * decayMultiplier / 100) * 100) / 100;
    }

    function gearDecayQuantityFromDiag(gearIdx, slot, diag) {
        const dodge = diag.ddg;
        const attacks = diag.n_attacks;
        const decayMultiplier = slot === "weapon" ? 1.0 : 1.0 - dodge / (dodge + 40);
        return gearDecayQuantity(attacks, decayMultiplier);
    }

    function calculateScrapGeneratedFromDiag(gearIdx, diag, ctx) {
        let totalScrap = 0.0;
        for (let i = 0; i < GEAR_SLOTS.length; i += 1) {
            const slot = GEAR_SLOTS[i];
            const tier = gearTier(gearIdx, i, ctx);
            const quantity = Math.max(0.01, gearDecayQuantityFromDiag(gearIdx, slot, diag));
            totalScrap += (gearAt(ctx, slot, gearIdx[i]).scrap / 3) * quantity;
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

    const EXACT_TIE_EPSILON = 1e-10;
    const campaignSimulationCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;

    function rawBuildKey(build) {
        return [
            build.skill_lvls.join(","),
            build.gear_idx.join(","),
            build.ammo_idx,
            build.food_idx,
            build.gear_rolls ? JSON.stringify(build.gear_rolls.map(item => item.mods)) : "",
        ].join("|");
    }

    function createRawBuild(candidate, totals, econ, selectionScore, ctx) {
        return {
            skill_lvls: candidate.skillLevels.slice(),
            gear_idx: candidate.gearIdx.slice(),
            gear_rolls: ctx ? candidate.gearIdx.map((choice, index) => ({ ...gearAt(ctx, GEAR_SLOTS[index], choice), mods: { ...gearAt(ctx, GEAR_SLOTS[index], choice).mods } })) : undefined,
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

    function modValue(item, stat) {
        return item && item.mods && Number.isFinite(item.mods[stat]) ? item.mods[stat] : 0;
    }

    function skillBudget(options) {
        const budget = Math.max(0, Math.floor((options.adjustedLevel || 0) * SKILL_POINTS_PER_LEVEL));
        return Math.min(budget, MAX_OPTIMIZED_SKILL_BUDGET);
    }

    function pinnedArray(options, key, length) {
        const values = options && Array.isArray(options[key]) ? options[key] : [];
        return Array.from({ length }, (_, index) => values[index] == null ? null : values[index]);
    }

    function pinnedIndex(options, key) {
        const value = options ? options[key] : null;
        return value == null ? null : value;
    }

    function getSearchPlan(options) {
        const ctx = createModelContext(options.priceOverrides);
        const budget = skillBudget(options);
        const combatCount = makeDamageCombatConfigs(ctx, options).length;
        const sustainCount = makeSustainConfigs(ctx, options).length;
        return { budget, combatCount, sustainCount,
            checks: combatCount * sustainCount * budgetSplitCount(budget, options) };
    }

    function normalizedBudgetTargets(options) {
        const targets = Array.isArray(options.budgetTargets) ? options.budgetTargets : [];
        return Array.from(new Set(targets
            .map((target) => Number(target))
            .filter((target) => Number.isFinite(target))))
            .sort((a, b) => a - b);
    }

    function usesBudgetedSearch(options) {
        return Number.isFinite(campaignBudgetLimit(options)) || normalizedBudgetTargets(options).length > 0;
    }

    function usesLootSkillBudget(options) {
        if (!usesBudgetedSearch(options)) return false;
        const rewards = options && options.priceOverrides && options.priceOverrides.rewards;
        return Boolean(rewards && (
            (Number(rewards.case1_price) || 0) > 0
            || (Number(rewards.case2_price) || 0) > 0
        ));
    }

    function lootSkillLevelsForBudget(budget, options) {
        const lootPin = pinnedArray(options, "pinnedSkills", 9)[8];
        if (lootPin !== null) {
            return SKILL_LEVEL_COST[lootPin] <= budget ? [lootPin] : [];
        }
        if (!usesLootSkillBudget(options)) return [0];
        return Array.from({ length: MAX_SKILL_LEVEL + 1 }, (_, level) => level)
            .filter((level) => SKILL_LEVEL_COST[level] <= budget);
    }

    function budgetSplitCount(budget, options) {
        return lootSkillLevelsForBudget(budget, options).reduce((total, level) => (
            total + budget - SKILL_LEVEL_COST[level] + 1
        ), 0);
    }

    function makeDamageCombatPatterns(budget, options) {
        const pins = pinnedArray(options, "pinnedSkills", 9);
        const patterns = [];
        for (let atk = pins[0] === null ? 0 : pins[0]; atk <= (pins[0] === null ? MAX_SKILL_LEVEL : pins[0]); atk += 1) {
            for (let prc = pins[1] === null ? 0 : pins[1]; prc <= (pins[1] === null ? MAX_SKILL_LEVEL : pins[1]); prc += 1) {
                for (let critc = pins[2] === null ? 0 : pins[2]; critc <= (pins[2] === null ? MAX_SKILL_LEVEL : pins[2]); critc += 1) {
                    for (let critd = pins[3] === null ? 0 : pins[3]; critd <= (pins[3] === null ? MAX_SKILL_LEVEL : pins[3]); critd += 1) {
                        const cost = SKILL_LEVEL_COST[atk] + SKILL_LEVEL_COST[prc] + SKILL_LEVEL_COST[critc] + SKILL_LEVEL_COST[critd];
                        if (cost <= budget) patterns.push({ cost, levels: [atk, prc, critc, critd] });
                    }
                }
            }
        }
        return patterns;
    }

    function makeSustainPatterns(budget, options) {
        const pins = pinnedArray(options, "pinnedSkills", 9);
        const patterns = [];
        for (let arm = pins[4] === null ? 0 : pins[4]; arm <= (pins[4] === null ? MAX_SKILL_LEVEL : pins[4]); arm += 1) {
            for (let ddg = pins[5] === null ? 0 : pins[5]; ddg <= (pins[5] === null ? MAX_SKILL_LEVEL : pins[5]); ddg += 1) {
                for (let hp = pins[6] === null ? 0 : pins[6]; hp <= (pins[6] === null ? MAX_SKILL_LEVEL : pins[6]); hp += 1) {
                    for (let hun = pins[7] === null ? 0 : pins[7]; hun <= (pins[7] === null ? MAX_SKILL_LEVEL : pins[7]); hun += 1) {
                        const cost = SKILL_LEVEL_COST[arm] + SKILL_LEVEL_COST[ddg] + SKILL_LEVEL_COST[hp] + SKILL_LEVEL_COST[hun];
                        if (cost <= budget) patterns.push({ cost, levels: [arm, ddg, hp, hun] });
                    }
                }
            }
        }
        return patterns;
    }

    function makeDamageCombatConfigs(ctx, options) {
        const gearPins = pinnedArray(options, "pinnedGear", GEAR_SLOTS.length);
        const ammoPin = pinnedIndex(options, "pinnedAmmo");
        const configs = [];
        for (let weaponIdx = 0; weaponIdx < ctx.gearChoices.weapon.length; weaponIdx += 1) {
            if (!gearChoiceAllowed(ctx, options, "weapon", weaponIdx)) continue;
            const weapon = gearAt(ctx, "weapon", weaponIdx);
            const ammoIndexes = gearAt(ctx, "weapon", weaponIdx).tierIndex <= 1 ? [0] : [1, 2, 3];
            for (let helmetIdx = 0; helmetIdx < ctx.gearChoices.helmet.length; helmetIdx += 1) {
                if (!gearChoiceAllowed(ctx, options, "helmet", helmetIdx)) continue;
                const helmet = gearAt(ctx, "helmet", helmetIdx);
                for (let glovesIdx = 0; glovesIdx < ctx.gearChoices.gloves.length; glovesIdx += 1) {
                    if (!gearChoiceAllowed(ctx, options, "gloves", glovesIdx)) continue;
                    const gloves = gearAt(ctx, "gloves", glovesIdx);
                    for (const ammoIdx of ammoIndexes) {
                        if (ammoPin !== null && ammoPin !== ammoIdx) continue;
                        configs.push({
                            weaponIdx,
                            helmetIdx,
                            glovesIdx,
                            ammoIdx,
                            baseAtk: BASELINE.atk + modValue(weapon, "atk"),
                            basePrc: BASELINE.prc + modValue(gloves, "prc"),
                            baseCritc: BASELINE.critc + modValue(weapon, "critc"),
                            baseCritd: BASELINE.critd + modValue(helmet, "critd"),
                            ammoBonus: ctx.ammo[AMMO_NAMES[ammoIdx]].dmg_bonus,
                        });
                    }
                }
            }
        }
        return configs;
    }

    function makeSustainConfigs(ctx, options) {
        const gearPins = pinnedArray(options, "pinnedGear", GEAR_SLOTS.length);
        const foodPin = pinnedIndex(options, "pinnedFood");
        const configs = [];
        for (let chestIdx = 0; chestIdx < ctx.gearChoices.chest.length; chestIdx += 1) {
            if (!gearChoiceAllowed(ctx, options, "chest", chestIdx)) continue;
            const chest = gearAt(ctx, "chest", chestIdx);
            for (let pantsIdx = 0; pantsIdx < ctx.gearChoices.pants.length; pantsIdx += 1) {
                if (!gearChoiceAllowed(ctx, options, "pants", pantsIdx)) continue;
                const pants = gearAt(ctx, "pants", pantsIdx);
                for (let bootsIdx = 0; bootsIdx < ctx.gearChoices.boots.length; bootsIdx += 1) {
                    if (!gearChoiceAllowed(ctx, options, "boots", bootsIdx)) continue;
                    const boots = gearAt(ctx, "boots", bootsIdx);
                    for (let foodIdx = 0; foodIdx < FOOD_NAMES.length; foodIdx += 1) {
                        if (foodPin !== null && foodPin !== foodIdx) continue;
                        configs.push({
                            chestIdx,
                            pantsIdx,
                            bootsIdx,
                            foodIdx,
                            baseArm: BASELINE.arm + modValue(chest, "arm") + modValue(pants, "arm"),
                            baseDdg: BASELINE.ddg + modValue(boots, "ddg"),
                            food: ctx.food[FOOD_NAMES[foodIdx]],
                        });
                    }
                }
            }
        }
        return configs;
    }

    function damageCombatValue(config, levels, options) {
        let atk = config.baseAtk + 25 * levels[0];
        const prcRaw = config.basePrc / 100 + 0.05 * levels[1];
        const critcRaw = config.baseCritc / 100 + 0.05 * levels[2];
        let critd = config.baseCritd / 100 + 0.20 * levels[3];
        const overflowMultiplier = 4.0;
        const prcOverflowPct = Math.max(0.0, (prcRaw - 1.0) * 100) * overflowMultiplier;
        const critcOverflowPct = Math.max(0.0, (critcRaw - 1.0) * 100) * overflowMultiplier;

        atk += prcOverflowPct;
        critd += critcOverflowPct * 0.01;

        const prc = Math.min(1.0, prcRaw);
        const critc = Math.min(1.0, critcRaw);
        const pillBonus = options.pill ? 1.6 : 1.0;
        atk *= pillBonus * (1.0 + config.ammoBonus) * options.rankBonus;
        return atk * prc * (1 + critc * critd) + (atk / 2.0) * (1 - prc);
    }

    function sustainValue(config, levels, options) {
        const arm = config.baseArm + 6 * levels[0];
        const ddg = config.baseDdg + 4 * levels[1];
        const hp = BASELINE.hp + 10 * levels[2];
        const hun = BASELINE.hun + levels[3];
        return attacksPossible(hp, hun, arm, ddg, config.food, options.pill);
    }

    function sustainStats(config, levels, options) {
        const arm = config.baseArm + 6 * levels[0];
        const ddg = config.baseDdg + 4 * levels[1];
        const hp = BASELINE.hp + 10 * levels[2];
        const hun = BASELINE.hun + levels[3];
        return {
            ddg,
            hun,
            attacks: attacksPossible(hp, hun, arm, ddg, config.food, options.pill),
        };
    }

    function makeValueTable(config, patterns, budget, valueFn, omitBudgetRuns = false) {
        const values = new Float64Array(budget + 1);
        const patternIndexes = new Int32Array(budget + 1);
        for (let i = 0; i <= budget; i += 1) {
            values[i] = Number.NEGATIVE_INFINITY;
            patternIndexes[i] = -1;
        }

        for (let i = 0; i < patterns.length; i += 1) {
            const pattern = patterns[i];
            if (pattern.cost > budget) continue;
            const value = valueFn(config, pattern.levels);
            if (Number.isFinite(value) && value > values[pattern.cost] + EXACT_TIE_EPSILON) {
                values[pattern.cost] = value;
                patternIndexes[pattern.cost] = i;
            }
        }

        for (let cost = 1; cost <= budget; cost += 1) {
            if (values[cost - 1] > values[cost] + EXACT_TIE_EPSILON) {
                values[cost] = values[cost - 1];
                patternIndexes[cost] = patternIndexes[cost - 1];
            }
        }

        const budgetRuns = [];
        if (budget >= 0 && !omitBudgetRuns) {
            let start = 0;
            let currentIndex = patternIndexes[0];
            let currentValue = values[0];
            for (let cost = 1; cost <= budget; cost += 1) {
                if (
                    patternIndexes[cost] !== currentIndex
                    || Math.abs(values[cost] - currentValue) > EXACT_TIE_EPSILON
                ) {
                    budgetRuns.push({ start, end: cost - 1, patternIndex: currentIndex, value: currentValue });
                    start = cost;
                    currentIndex = patternIndexes[cost];
                    currentValue = values[cost];
                }
            }
            budgetRuns.push({ start, end: budget, patternIndex: currentIndex, value: currentValue });
        }

        return { config, values, patternIndexes, budgetRuns };
    }

    function forEachUniqueBudgetSplit(combatTable, sustainTable, budget, callback) {
        const combatRuns = combatTable.budgetRuns || [];
        const sustainRuns = sustainTable.budgetRuns || [];
        if (!combatRuns.length || !sustainRuns.length) return;

        let combatBudget = 0;
        let combatRunIndex = 0;
        let sustainRunIndex = sustainRuns.length - 1;
        while (combatBudget <= budget) {
            while (combatRunIndex < combatRuns.length && combatRuns[combatRunIndex].end < combatBudget) {
                combatRunIndex += 1;
            }

            const sustainBudget = budget - combatBudget;
            while (sustainRunIndex > 0 && sustainRuns[sustainRunIndex].start > sustainBudget) {
                sustainRunIndex -= 1;
            }

            const combatRun = combatRuns[combatRunIndex];
            const sustainRun = sustainRuns[sustainRunIndex];
            if (!combatRun || !sustainRun) break;

            if (
                combatRun.patternIndex >= 0
                && sustainRun.patternIndex >= 0
                && sustainRun.start <= sustainBudget
                && sustainBudget <= sustainRun.end
            ) {
                callback(combatBudget, sustainBudget, combatRun.value * sustainRun.value);
            }

            const nextCombatBudget = Math.min(
                combatRun.end + 1,
                budget - sustainRun.start + 1
            );
            combatBudget = nextCombatBudget > combatBudget ? nextCombatBudget : combatBudget + 1;
        }
    }

    function attachCombatEconomy(table, patterns, budget, ctx) {
        const config = table.config;
        const weapon = gearAt(ctx, "weapon", config.weaponIdx);
        const helmet = gearAt(ctx, "helmet", config.helmetIdx);
        const gloves = gearAt(ctx, "gloves", config.glovesIdx);
        const prc = new Float64Array(budget + 1);

        for (let cost = 0; cost <= budget; cost += 1) {
            const patternIndex = table.patternIndexes[cost];
            if (patternIndex < 0) {
                prc[cost] = Number.NaN;
                continue;
            }
            const levels = patterns[patternIndex].levels;
            prc[cost] = Math.min(1.0, config.basePrc / 100 + 0.05 * levels[1]);
        }

        table.economy = {
            prc,
            fixedAttackCost: weapon.cost / 100 + ctx.ammo[AMMO_NAMES[config.ammoIdx]].bullet_cost,
            dodgeAttackCost: (helmet.cost + gloves.cost) / 100,
            weaponScrap: weapon.scrap / 3,
            dodgeScrap: (helmet.scrap + gloves.scrap) / 3,
        };
        return table;
    }

    function attachSustainEconomy(table, patterns, budget, options, ctx) {
        const config = table.config;
        const chest = gearAt(ctx, "chest", config.chestIdx);
        const pants = gearAt(ctx, "pants", config.pantsIdx);
        const boots = gearAt(ctx, "boots", config.bootsIdx);
        const sustainGearAttackCost = (chest.cost + pants.cost + boots.cost) / 100;
        const sustainGearScrap = (chest.scrap + pants.scrap + boots.scrap) / 3;
        const dayMultiplier = options.pill ? 1.8 : 2.4;

        const attacks = new Float64Array(budget + 1);
        const dodgeDecay = new Float64Array(budget + 1);
        const foodCost = new Float64Array(budget + 1);
        const weaponQuantity = new Float64Array(budget + 1);
        const dodgeQuantity = new Float64Array(budget + 1);
        const sustainGearCost = new Float64Array(budget + 1);
        const sustainScrap = new Float64Array(budget + 1);

        for (let cost = 0; cost <= budget; cost += 1) {
            const patternIndex = table.patternIndexes[cost];
            if (patternIndex < 0) {
                attacks[cost] = Number.NaN;
                dodgeDecay[cost] = Number.NaN;
                foodCost[cost] = Number.NaN;
                weaponQuantity[cost] = Number.NaN;
                dodgeQuantity[cost] = Number.NaN;
                sustainGearCost[cost] = Number.NaN;
                sustainScrap[cost] = Number.NaN;
                continue;
            }

            const sustain = sustainStats(config, patterns[patternIndex].levels, options);
            const decay = 1 - sustain.ddg / (sustain.ddg + 40);
            const weaponQty = Math.max(0.01, gearDecayQuantity(sustain.attacks, 1.0));
            const dodgeQty = Math.max(0.01, gearDecayQuantity(sustain.attacks, decay));

            attacks[cost] = sustain.attacks;
            dodgeDecay[cost] = decay;
            foodCost[cost] = config.food.cost * sustain.hun * dayMultiplier;
            weaponQuantity[cost] = weaponQty;
            dodgeQuantity[cost] = dodgeQty;
            sustainGearCost[cost] = sustainGearAttackCost * sustain.attacks * decay;
            sustainScrap[cost] = sustainGearScrap * dodgeQty;
        }

        table.economy = {
            attacks,
            dodgeDecay,
            foodCost,
            weaponQuantity,
            dodgeQuantity,
            sustainGearCost,
            sustainScrap,
        };
        return table;
    }

    function exactPrimary(build) {
        return build.total_damage;
    }

    function betterExactBuild(candidate, incumbent) {
        if (!candidate) return false;
        if (!incumbent) return true;
        const candidatePrimary = exactPrimary(candidate);
        const incumbentPrimary = exactPrimary(incumbent);
        const epsilon = Math.max(1, Math.abs(incumbentPrimary)) * EXACT_TIE_EPSILON;
        if (candidatePrimary > incumbentPrimary + epsilon) return true;
        if (Math.abs(candidatePrimary - incumbentPrimary) <= epsilon) {
            return candidate.net_cost < incumbent.net_cost - EXACT_TIE_EPSILON;
        }
        return false;
    }

    function candidateScoreForTarget(primary, netCost, target) {
        const targetCost = Math.max(0, Number(target) || 0);
        const costDistance = targetCost > 0 ? Math.abs(netCost - targetCost) / targetCost : Math.abs(netCost);
        const overBudgetPenalty = netCost > targetCost ? 0.90 : 1.0;
        return (primary * overBudgetPenalty) / (1 + costDistance);
    }

    function campaignWarDays(options) {
        const days = Number(options.campaignWarDays);
        return Number.isFinite(days) && days > 0 ? days : 1;
    }

    function campaignInitialStockpile(options) {
        const stockpile = Number(options.campaignInitialStockpile);
        if (Number.isFinite(stockpile)) return stockpile;
        const campaignBudget = Number(options.campaignBudget);
        return Number.isFinite(campaignBudget) ? campaignBudget : 0;
    }

    function campaignWarProfitDay(options) {
        const profit = Number(options.campaignWarProfitDay);
        return Number.isFinite(profit) ? profit : 0;
    }

    function campaignBudgetLimit(options) {
        const campaignBudget = options.campaignBudget == null ? NaN : Number(options.campaignBudget);
        if (Number.isFinite(campaignBudget)) return campaignBudget;
        const dailyBudget = options.dailyBudget == null ? NaN : Number(options.dailyBudget);
        return Number.isFinite(dailyBudget) ? dailyBudget : null;
    }

    function bountyIncomeForDamage(totalDamage, options) {
        const bounty = Number(options.bountyPer1kDamage) || 0;
        return Math.max(0, (Number(totalDamage) || 0) / 1000 * bounty);
    }

    function battleLootIncomeForDamage(totalDamage, options) {
        const battleLoot = Number(options.battleLootPer1kDamage) || 0;
        return Math.max(0, (Number(totalDamage) || 0) / 1000 * battleLoot);
    }

    function campaignCostFromNetCost(netCost, options) {
        if (!(options.campaignBudget != null && Number.isFinite(Number(options.campaignBudget)))) return netCost;
        const days = campaignWarDays(options);
        return netCost * days;
    }

    function campaignDayShortfall(initialStockpile, dailySpend, dailyIncome, day) {
        const delta = dailyIncome - dailySpend;
        const endingStockpile = initialStockpile + day * delta;
        const endingShortfall = endingStockpile < -0.000001 ? -endingStockpile : 0;
        return endingShortfall;
    }

    function firstCampaignFailureDay(initialStockpile, dailySpend, dailyIncome, simulatedDays) {
        if (simulatedDays <= 0) return null;
        const firstShortfall = campaignDayShortfall(initialStockpile, dailySpend, dailyIncome, 1);
        if (firstShortfall > 0.000001) return 1;

        const delta = dailyIncome - dailySpend;
        if (delta >= 0) return null;

        const lastShortfall = campaignDayShortfall(initialStockpile, dailySpend, dailyIncome, simulatedDays);
        if (lastShortfall <= 0.000001) return null;

        let lo = 1;
        let hi = simulatedDays;
        while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (campaignDayShortfall(initialStockpile, dailySpend, dailyIncome, mid) > 0.000001) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return lo;
    }

    function simulateCampaignValues(dailyNetCost, totalDamage, options, includeDayBudgets = true) {
        const days = campaignWarDays(options);
        const simulatedDays = Math.max(0, Math.floor(days));
        const dailySpend = Number(dailyNetCost) || 0;
        const dailyDamage = Math.max(0, Number(totalDamage) || 0);
        const dailyBountyIncome = bountyIncomeForDamage(dailyDamage, options);
        const dailyBattleLootIncome = battleLootIncomeForDamage(dailyDamage, options);
        const initialStockpile = campaignInitialStockpile(options);
        const dailyIncome = campaignWarProfitDay(options) + dailyBountyIncome + dailyBattleLootIncome;
        const dayBudgets = [];
        const delta = dailyIncome - dailySpend;
        const remainingBudget = initialStockpile + simulatedDays * delta;
        const lowestStartingBudget = simulatedDays > 0 && delta < 0
            ? initialStockpile + (simulatedDays - 1) * delta
            : initialStockpile;
        const largestShortfall = simulatedDays > 0
            ? Math.max(
                0,
                campaignDayShortfall(
                    initialStockpile,
                    dailySpend,
                    dailyIncome,
                    delta < 0 ? simulatedDays : 1
                )
            )
            : 0;
        const failedDay = firstCampaignFailureDay(initialStockpile, dailySpend, dailyIncome, simulatedDays);
        const sustainable = failedDay == null;

        if (includeDayBudgets) {
            let stockpile = initialStockpile;
            for (let day = 1; day <= days; day += 1) {
                const startingStockpile = stockpile;
                stockpile = startingStockpile - dailySpend + dailyIncome;
                const endingShortfall = stockpile < -0.000001 ? -stockpile : 0;
                const shortfall = endingShortfall;
                const overBudget = shortfall > 0.000001;
                dayBudgets.push({
                    day,
                    startingStockpile,
                    dailyNetCost: dailySpend,
                    dailyIncome,
                    endingStockpile: stockpile,
                    overBudget,
                    shortfall: overBudget ? shortfall : 0,
                });
            }
        }

        const bountyIncome = dailyBountyIncome * days;
        const battleLootIncome = dailyBattleLootIncome * days;
        const availableBudget = campaignInitialStockpile(options) + campaignWarProfitDay(options) * days + bountyIncome + battleLootIncome;
        const warTotalCost = dailySpend * days;
        const campaignTotalDamage = dailyDamage * days;
        return {
            dailyNetCost: dailySpend,
            dailyBountyIncome,
            dailyBattleLootIncome,
            sustainable,
            failedDay,
            largestShortfall,
            lowestStartingBudget,
            remainingBudget,
            availableBudget,
            bountyIncome,
            battleLootIncome,
            warTotalCost,
            campaignTotalDamage,
            budgetUsagePct: availableBudget > 0 ? warTotalCost / availableBudget * 100 : 0,
            dayBudgets,
        };
    }

    function simulateCampaignBuild(build, options) {
        if (campaignSimulationCache && build && typeof build === "object") {
            const cached = campaignSimulationCache.get(build);
            if (cached && cached.options === options) return cached.simulation;
            const simulation = simulateCampaignValues(Number(build.net_cost) || 0, Number(build.total_damage) || 0, options);
            campaignSimulationCache.set(build, { options, simulation });
            return simulation;
        }
        return simulateCampaignValues(Number(build.net_cost) || 0, Number(build.total_damage) || 0, options);
    }

    function campaignCostForBuild(build, options) {
        return (options.campaignBudget != null && Number.isFinite(Number(options.campaignBudget)))
            ? simulateCampaignBuild(build, options).warTotalCost
            : Number(build.net_cost) || 0;
    }

    function campaignBudgetForBuild(build, options) {
        return (options.campaignBudget != null && Number.isFinite(Number(options.campaignBudget)))
            ? simulateCampaignBuild(build, options).availableBudget
            : campaignBudgetLimit(options);
    }

    function campaignIsBuildSustainable(build, options) {
        return (options.campaignBudget != null && Number.isFinite(Number(options.campaignBudget)))
            ? simulateCampaignBuild(build, options).sustainable
            : campaignCostForBuild(build, options) <= campaignBudgetLimit(options);
    }

    function quickNetCost(combatTable, sustainTable, combatPatterns, sustainPatterns, combatBudget, sustainBudget, options, ctx, lootLevel = 0) {
        const combatPattern = combatPatterns[combatTable.patternIndexes[combatBudget]];
        const sustainPattern = sustainPatterns[sustainTable.patternIndexes[sustainBudget]];
        if (!combatPattern || !sustainPattern) return Number.POSITIVE_INFINITY;

        const sustain = sustainStats(sustainTable.config, sustainPattern.levels, options);
        const dodgeDecay = 1 - sustain.ddg / (sustain.ddg + 40);
        const dayMultiplier = options.pill ? 1.8 : 2.4;
        const foodCost = sustainTable.config.food.cost * sustain.hun * dayMultiplier;
        const pillCost = options.pill ? ctx.rewards.pill_price : 0.0;
        const ammoIdx = combatTable.config.ammoIdx;
        const ammoCost = ctx.ammo[AMMO_NAMES[ammoIdx]].bullet_cost * sustain.attacks;

        const weaponIdx = combatTable.config.weaponIdx;
        const helmetIdx = combatTable.config.helmetIdx;
        const glovesIdx = combatTable.config.glovesIdx;
        const gearParts = [
            ["weapon", weaponIdx, 1.0],
            ["helmet", helmetIdx, dodgeDecay],
            ["gloves", glovesIdx, dodgeDecay],
            ["chest", sustainTable.config.chestIdx, dodgeDecay],
            ["pants", sustainTable.config.pantsIdx, dodgeDecay],
            ["boots", sustainTable.config.bootsIdx, dodgeDecay],
        ];

        let gearCost = 0.0;
        let scrapGenerated = 0.0;
        for (const [slot, choiceIndex, decayMultiplier] of gearParts) {
            const gear = gearAt(ctx, slot, choiceIndex);
            gearCost += (gear.cost / 100) * sustain.attacks * decayMultiplier;
            const quantity = Math.max(0.01, Math.round((sustain.attacks * decayMultiplier / 100) * 100) / 100);
            scrapGenerated += (gear.scrap / 3) * quantity;
        }

        const prc = Math.min(1.0, combatTable.config.basePrc / 100 + 0.05 * combatPattern.levels[1]);
        const loot = 0.02 + 0.02 * lootLevel;
        const casesPerDay = loot * sustain.attacks * prc;
        const eliteCasesPerDay = (loot / 100) * sustain.attacks * prc;
        const totalCost = gearCost + foodCost + ammoCost + pillCost;
        return totalCost
            - scrapGenerated * ctx.rewards.scrap_price
            - casesPerDay * ctx.rewards.case1_price
            - eliteCasesPerDay * ctx.rewards.case2_price;
    }

    function quickNetCostFromTables(combatTable, sustainTable, combatPatterns, sustainPatterns, combatBudget, sustainBudget, options, ctx, lootLevel = 0) {
        const combatEconomy = combatTable.economy;
        const sustainEconomy = sustainTable.economy;
        if (!combatEconomy || !sustainEconomy) {
            return quickNetCost(combatTable, sustainTable, combatPatterns, sustainPatterns, combatBudget, sustainBudget, options, ctx, lootLevel);
        }

        const attacks = sustainEconomy.attacks[sustainBudget];
        const decay = sustainEconomy.dodgeDecay[sustainBudget];
        const prc = combatEconomy.prc[combatBudget];
        if (!Number.isFinite(attacks) || !Number.isFinite(decay) || !Number.isFinite(prc)) {
            return Number.POSITIVE_INFINITY;
        }

        const totalCost = sustainEconomy.foodCost[sustainBudget]
            + sustainEconomy.sustainGearCost[sustainBudget]
            + attacks * (combatEconomy.fixedAttackCost + combatEconomy.dodgeAttackCost * decay)
            + (options.pill ? ctx.rewards.pill_price : 0.0);
        const scrapGenerated = combatEconomy.weaponScrap * sustainEconomy.weaponQuantity[sustainBudget]
            + combatEconomy.dodgeScrap * sustainEconomy.dodgeQuantity[sustainBudget]
            + sustainEconomy.sustainScrap[sustainBudget];
        const loot = 0.02 + 0.02 * lootLevel;
        const casesPerDay = loot * attacks * prc;
        const eliteCasesPerDay = (loot / 100) * attacks * prc;

        return totalCost
            - scrapGenerated * ctx.rewards.scrap_price
            - casesPerDay * ctx.rewards.case1_price
            - eliteCasesPerDay * ctx.rewards.case2_price;
    }

    function createExactRawBuild(combatTable, sustainTable, combatPatterns, sustainPatterns, combatBudget, sustainBudget, options, ctx, lootLevel = 0) {
        const combatPattern = combatPatterns[combatTable.patternIndexes[combatBudget]];
        const sustainPattern = sustainPatterns[sustainTable.patternIndexes[sustainBudget]];
        if (!combatPattern || !sustainPattern) return null;

        const skillLevels = [
            combatPattern.levels[0],
            combatPattern.levels[1],
            combatPattern.levels[2],
            combatPattern.levels[3],
            sustainPattern.levels[0],
            sustainPattern.levels[1],
            sustainPattern.levels[2],
            sustainPattern.levels[3],
            lootLevel,
        ];
        const gearIdx = [
            combatTable.config.weaponIdx,
            combatTable.config.helmetIdx,
            combatTable.config.glovesIdx,
            sustainTable.config.chestIdx,
            sustainTable.config.pantsIdx,
            sustainTable.config.bootsIdx,
        ];
        const ammoIdx = combatTable.config.ammoIdx;

        const candidate = {
            skillLevels,
            gearIdx,
            ammoIdx,
            foodIdx: sustainTable.config.foodIdx,
        };
        const totals = computeTotals(candidate.skillLevels, candidate.gearIdx, candidate.ammoIdx, candidate.foodIdx, options, ctx);
        const econ = computeEconomics(candidate.skillLevels, candidate.gearIdx, totals.totalCost, totals.diag, ctx);
        const primary = totals.totalDamage;
        const denominator = Math.max(primary, 1);
        return createRawBuild(candidate, totals, econ, econ.net_cost / denominator, ctx);
    }

    function runBestDamageSearch(options, onProgress, ctx, plan, budget, combatTables, sustainConfigs, combatPatterns, sustainPatterns, sustainValueFn, reportStage) {
        const sustainStart = Math.max(0, Math.min(sustainConfigs.length, Math.floor(options.sustainStart || 0)));
        const sustainEnd = Math.max(sustainStart, Math.min(sustainConfigs.length, Math.floor(options.sustainEnd == null ? sustainConfigs.length : options.sustainEnd)));
        const evaluated = (sustainEnd - sustainStart) * plan.combatCount * (budget + 1);
        const frontierBucketCount = 64;
        const frontierMinDamage = 50000;
        const bestCombatByBudget = Array(budget + 1).fill(null);
        const bestSustainByBudget = Array(budget + 1).fill(null);
        const sustainTables = [];

        for (const table of combatTables) {
            for (let cost = 0; cost <= budget; cost += 1) {
                const value = table.values[cost];
                if (!Number.isFinite(value) || table.patternIndexes[cost] < 0) continue;
                const current = bestCombatByBudget[cost];
                if (!current || value > current.value + EXACT_TIE_EPSILON) {
                    bestCombatByBudget[cost] = { table, budget: cost, value };
                }
            }
        }

        for (let sustainIndex = sustainStart; sustainIndex < sustainEnd; sustainIndex += 1) {
            const table = attachSustainEconomy(
                makeValueTable(sustainConfigs[sustainIndex], sustainPatterns, budget, sustainValueFn, ctx.rollSearch),
                sustainPatterns,
                budget,
                options,
                ctx
            );
            sustainTables.push(table);
            reportStage(0.3, 0.6, sustainIndex - sustainStart + 1, sustainEnd - sustainStart);
            for (let cost = 0; cost <= budget; cost += 1) {
                const value = table.values[cost];
                if (!Number.isFinite(value) || table.patternIndexes[cost] < 0) continue;
                const current = bestSustainByBudget[cost];
                if (!current || value > current.value + EXACT_TIE_EPSILON) {
                    bestSustainByBudget[cost] = { table, budget: cost, value };
                }
            }
        }

        let bestValue = Number.NEGATIVE_INFINITY;
        let bestSelection = null;
        let bestBuild = null;
        for (let combatBudget = 0; combatBudget <= budget; combatBudget += 1) {
            const combat = bestCombatByBudget[combatBudget];
            const sustain = bestSustainByBudget[budget - combatBudget];
            if (!combat || !sustain) continue;

            const value = combat.value * sustain.value;
            const epsilon = Math.max(1, Math.abs(bestValue)) * EXACT_TIE_EPSILON;
            if (!bestSelection || value > bestValue + epsilon) {
                bestValue = value;
                bestSelection = { combat, sustain };
                bestBuild = null;
            } else if (Math.abs(value - bestValue) <= epsilon && bestSelection) {
                const candidateBuild = createExactRawBuild(
                    combat.table,
                    sustain.table,
                    combatPatterns,
                    sustainPatterns,
                    combat.budget,
                    sustain.budget,
                    options,
                    ctx
                );
                if (!bestBuild) {
                    bestBuild = createExactRawBuild(
                        bestSelection.combat.table,
                        bestSelection.sustain.table,
                        combatPatterns,
                        sustainPatterns,
                        bestSelection.combat.budget,
                        bestSelection.sustain.budget,
                        options,
                        ctx
                    );
                }
                if (betterExactBuild(candidateBuild, bestBuild)) {
                    bestValue = value;
                    bestSelection = { combat, sustain };
                    bestBuild = candidateBuild;
                }
            }
        }

        if (bestSelection && !bestBuild) {
            bestBuild = createExactRawBuild(
                bestSelection.combat.table,
                bestSelection.sustain.table,
                combatPatterns,
                sustainPatterns,
                bestSelection.combat.budget,
                bestSelection.sustain.budget,
                options,
                ctx
            );
        }

        const economyCombatTables = combatTables.map((table, index) => {
            const result = table.economy ? table : attachCombatEconomy(table, combatPatterns, budget, ctx);
            reportStage(0.6, 0.65, index + 1, combatTables.length);
            return result;
        });
        const frontierCandidates = Array(frontierBucketCount).fill(null);
        const cheapCandidates = [];
        const cheapCandidateIndexes = new Map();
        const highDamageCandidates = [];
        const highDamageCandidateIndexes = new Map();

        function sideCandidateKey(entry) {
            const config = entry.table.config;
            return [
                config.weaponIdx,
                config.helmetIdx,
                config.glovesIdx,
                config.ammoIdx,
                config.chestIdx,
                config.pantsIdx,
                config.bootsIdx,
                config.foodIdx,
                entry.table.patternIndexes[entry.budget],
            ].join("|");
        }

        function addSortedEntry(list, entry, limit, sorter) {
            const existingIndex = list.findIndex((item) => item.key === entry.key);
            if (existingIndex >= 0) {
                const existing = list[existingIndex];
                if (sorter(entry, existing) >= 0) return;
                list[existingIndex] = entry;
            } else {
                list.push(entry);
            }
            list.sort(sorter);
            if (list.length > limit) list.length = limit;
        }

        function mergeEntryLists(...lists) {
            const merged = [];
            const seen = new Set();
            for (const list of lists) {
                for (const entry of list) {
                    if (seen.has(entry.key)) continue;
                    seen.add(entry.key);
                    merged.push(entry);
                }
            }
            return merged;
        }

        function buildCombatBudgetCandidates() {
            const byBudget = Array.from({ length: budget + 1 }, () => ({ value: [], cheap: [] }));
            const valueSorter = (a, b) => b.value - a.value || a.costHint - b.costHint;
            const cheapSorter = (a, b) => a.costHint - b.costHint || b.value - a.value;
            const caseIncomePerAttack = ctx.rewards.case1_price * 0.02 + ctx.rewards.case2_price * 0.0002;

            for (const [tableIndex, table] of economyCombatTables.entries()) {
                for (let cost = 0; cost <= budget; cost += 1) {
                    const value = table.values[cost];
                    const prc = table.economy && table.economy.prc[cost];
                    if (!Number.isFinite(value) || !Number.isFinite(prc) || table.patternIndexes[cost] < 0) continue;
                    const economy = table.economy;
                    const costHint = economy.fixedAttackCost
                        + economy.dodgeAttackCost
                        - prc * caseIncomePerAttack;
                    const entry = {
                        table,
                        budget: cost,
                        value,
                        costHint,
                    };
                    entry.key = sideCandidateKey(entry);
                    addSortedEntry(byBudget[cost].value, entry, 12, valueSorter);
                    addSortedEntry(byBudget[cost].cheap, entry, 8, cheapSorter);
                }
                reportStage(0.65, 0.72, tableIndex + 1, economyCombatTables.length);
            }

            return byBudget.map((bucket) => mergeEntryLists(bucket.value, bucket.cheap));
        }

        function buildSustainBudgetCandidates() {
            const byBudget = Array.from({ length: budget + 1 }, () => ({ value: [], cheap: [] }));
            const valueSorter = (a, b) => b.value - a.value || a.costHint - b.costHint;
            const cheapSorter = (a, b) => a.costHint - b.costHint || b.value - a.value;

            for (const [tableIndex, table] of sustainTables.entries()) {
                for (let cost = 0; cost <= budget; cost += 1) {
                    const value = table.values[cost];
                    const economy = table.economy;
                    if (!Number.isFinite(value) || table.patternIndexes[cost] < 0) continue;
                    const costHint = economy.foodCost[cost]
                        + economy.sustainGearCost[cost];
                    const entry = {
                        table,
                        budget: cost,
                        value,
                        costHint,
                    };
                    entry.key = sideCandidateKey(entry);
                    addSortedEntry(byBudget[cost].value, entry, 12, valueSorter);
                    addSortedEntry(byBudget[cost].cheap, entry, 8, cheapSorter);
                }
                reportStage(0.72, 0.8, tableIndex + 1, sustainTables.length);
            }

            return byBudget.map((bucket) => mergeEntryLists(bucket.value, bucket.cheap));
        }

        function candidateKey(candidate) {
            return [
                candidate.combatTable.config.weaponIdx,
                candidate.combatTable.config.helmetIdx,
                candidate.combatTable.config.glovesIdx,
                candidate.combatTable.config.ammoIdx,
                candidate.sustainTable.config.chestIdx,
                candidate.sustainTable.config.pantsIdx,
                candidate.sustainTable.config.bootsIdx,
                candidate.sustainTable.config.foodIdx,
                candidate.combatTable.patternIndexes[candidate.combatBudget],
                candidate.sustainTable.patternIndexes[candidate.sustainBudget],
            ].join("|");
        }

        function createCandidateRef(combatTable, sustainTable, combatBudget, sustainBudget, primary, netCost) {
            const candidate = {
                combatTable,
                sustainTable,
                combatBudget,
                sustainBudget,
                primary,
                netCost,
                raw: null,
            };
            candidate.key = candidateKey(candidate);
            return candidate;
        }

        function materializeCandidate(candidate) {
            if (!candidate) return null;
            if (!candidate.raw) {
                candidate.raw = createExactRawBuild(
                    candidate.combatTable,
                    candidate.sustainTable,
                    combatPatterns,
                    sustainPatterns,
                    candidate.combatBudget,
                    candidate.sustainBudget,
                    options,
                    ctx
                );
            }
            return candidate.raw;
        }

        function candidateEfficiency(candidate) {
            return candidate.netCost > 0 ? candidate.primary / candidate.netCost : Number.MAX_SAFE_INTEGER + candidate.primary;
        }

        function betterFrontierCandidate(candidate, incumbent) {
            if (!candidate) return false;
            if (!incumbent) return true;
            const candidateScore = candidateEfficiency(candidate);
            const incumbentScore = candidateEfficiency(incumbent);
            if (candidateScore > incumbentScore + EXACT_TIE_EPSILON) return true;
            if (Math.abs(candidateScore - incumbentScore) <= EXACT_TIE_EPSILON) {
                const epsilon = Math.max(1, Math.abs(incumbent.primary)) * EXACT_TIE_EPSILON;
                if (candidate.primary > incumbent.primary + epsilon) return true;
                if (Math.abs(candidate.primary - incumbent.primary) <= epsilon) {
                    return candidate.netCost < incumbent.netCost - EXACT_TIE_EPSILON;
                }
            }
            return false;
        }

        function addRankedCandidate(list, indexes, candidate, limit, sorter) {
            const existingIndex = indexes.get(candidate.key);
            if (existingIndex != null) {
                if (sorter(candidate, list[existingIndex]) >= 0) return;
                list[existingIndex] = candidate;
            } else {
                list.push(candidate);
            }
            list.sort(sorter);
            if (list.length > limit) list.length = limit;
            indexes.clear();
            list.forEach((item, index) => indexes.set(item.key, index));
        }

        function addFrontierCandidate(candidate) {
            if (!candidate || candidate.primary < frontierMinDamage) return;
            const ratio = bestValue > 0 ? candidate.primary / bestValue : 0;
            const bucket = Math.max(0, Math.min(frontierBucketCount - 1, Math.floor(ratio * frontierBucketCount)));
            if (betterFrontierCandidate(candidate, frontierCandidates[bucket])) {
                frontierCandidates[bucket] = candidate;
            }
            addRankedCandidate(
                cheapCandidates,
                cheapCandidateIndexes,
                candidate,
                32,
                (a, b) => a.netCost - b.netCost || b.primary - a.primary
            );
            addRankedCandidate(
                highDamageCandidates,
                highDamageCandidateIndexes,
                candidate,
                32,
                (a, b) => b.primary - a.primary || a.netCost - b.netCost
            );
        }

        const combatBudgetCandidates = buildCombatBudgetCandidates();
        const sustainBudgetCandidates = buildSustainBudgetCandidates();
        if (ctx.rollSearch) {
            combatTables.length = 0;
            economyCombatTables.length = 0;
            sustainTables.length = 0;
        }
        for (let combatBudget = 0; combatBudget <= budget; combatBudget += 1) {
            const sustainBudget = budget - combatBudget;
            for (const combatEntry of combatBudgetCandidates[combatBudget]) {
                for (const sustainEntry of sustainBudgetCandidates[sustainBudget]) {
                    const value = combatEntry.value * sustainEntry.value;
                    if (!Number.isFinite(value) || value <= 0) continue;
                    const netCost = quickNetCostFromTables(
                        combatEntry.table,
                        sustainEntry.table,
                        combatPatterns,
                        sustainPatterns,
                        combatEntry.budget,
                        sustainEntry.budget,
                        options,
                        ctx
                    );
                    if (!Number.isFinite(netCost)) continue;
                    addFrontierCandidate(createCandidateRef(
                        combatEntry.table,
                        sustainEntry.table,
                        combatEntry.budget,
                        sustainEntry.budget,
                        value,
                        netCost
                    ));
                }
            }
            reportStage(0.8, 1, combatBudget + 1, budget + 1);
        }

        if (onProgress) onProgress(evaluated);
        return {
            builds: [
                bestBuild,
                ...frontierCandidates,
                ...cheapCandidates,
                ...highDamageCandidates,
            ].filter(Boolean).map((candidate) => (
                candidate.skill_lvls ? candidate : materializeCandidate(candidate)
            )).filter(Boolean),
            evaluated,
            total: evaluated,
        };
    }

    function runSearch(options, onProgress, onStageProgress) {
        const ctx = createModelContext(options.priceOverrides);
        const plan = getSearchPlan(options);
        const budget = plan.budget;
        const combatConfigs = makeDamageCombatConfigs(ctx, options);
        const sustainConfigs = makeSustainConfigs(ctx, options);
        const combatPatterns = makeDamageCombatPatterns(budget, options);
        const sustainPatterns = makeSustainPatterns(budget, options);
        const combatValueFn = (config, levels) => damageCombatValue(config, levels, options);
        const sustainValueFn = (config, levels) => sustainValue(config, levels, options);
        const sustainStart = Math.max(0, Math.min(sustainConfigs.length, Math.floor(options.sustainStart || 0)));
        const sustainEnd = Math.max(sustainStart, Math.min(sustainConfigs.length, Math.floor(options.sustainEnd == null ? sustainConfigs.length : options.sustainEnd)));
        let stageFraction = 0;
        function emitStage(fraction) {
            stageFraction = Math.max(stageFraction, Math.min(1, fraction));
            if (onStageProgress) onStageProgress(stageFraction);
        }
        function reportStage(start, end, completed, total) {
            if (onStageProgress && (completed === total || completed % Math.max(1, Math.ceil(total / 100)) === 0)) {
                emitStage(start + (end - start) * completed / Math.max(1, total));
            }
        }
        const numericProgress = onProgress;
        const workerChecks = plan.sustainCount > 0 ? plan.checks * (sustainEnd - sustainStart) / plan.sustainCount : 0;
        onProgress = evaluated => {
            if (numericProgress) numericProgress(evaluated);
            if (onStageProgress) emitStage(0.8 + 0.2 * Math.min(1, evaluated / Math.max(1, workerChecks)));
        };
        if (onStageProgress) onStageProgress(0);
        const budgetTargets = normalizedBudgetTargets(options);
        const campaignBudget = campaignBudgetLimit(options);
        const hasCampaignBudget = Number.isFinite(campaignBudget);
        const pinnedLootLevel = pinnedArray(options, "pinnedSkills", 9)[8];
        const needsCandidateCosts = hasCampaignBudget || budgetTargets.length > 0 || (pinnedLootLevel !== null && pinnedLootLevel > 0);
        const combatTables = combatConfigs.map((config, index) => {
            const table = makeValueTable(config, combatPatterns, budget, combatValueFn, ctx.rollSearch && !(needsCandidateCosts && options.exactCampaignSearch));
            const result = needsCandidateCosts ? attachCombatEconomy(table, combatPatterns, budget, ctx) : table;
            reportStage(0, 0.3, index + 1, combatConfigs.length);
            return result;
        });

        if (!needsCandidateCosts) {
            return runBestDamageSearch(
                options,
                onProgress,
                ctx,
                plan,
                budget,
                combatTables,
                sustainConfigs,
                combatPatterns,
                sustainPatterns,
                sustainValueFn,
                reportStage
            );
        }

        const targetBuilds = Array(budgetTargets.length).fill(null);
        const frontierTargets = budgetTargets.length ? budgetTargets : [];
        const frontierBuilds = Array(frontierTargets.length).fill(null);
        const lootSkillLevels = lootSkillLevelsForBudget(budget, options);
        const splitChecks = budgetSplitCount(budget, options);
        const totalChecks = (sustainEnd - sustainStart) * combatTables.length * splitChecks;
        const progressEvery = Math.max(1000, Math.floor(totalChecks / 100));
        let nextProgress = progressEvery;
        let evaluated = 0;
        let bestValue = Number.NEGATIVE_INFINITY;
        let bestCandidate = null;
        let bestUnderCampaignBudgetValue = Number.NEGATIVE_INFINITY;
        let bestUnderCampaignBudgetCandidate = null;
        let lowestCostValue = Number.POSITIVE_INFINITY;
        let lowestCostCandidate = null;
        const affordableCandidates = [];
        const affordableCandidateIndexes = new Map();

        function candidateKey(candidate) {
            return [
                candidate.combatTable.config.weaponIdx,
                candidate.combatTable.config.helmetIdx,
                candidate.combatTable.config.glovesIdx,
                candidate.combatTable.config.ammoIdx,
                candidate.sustainTable.config.chestIdx,
                candidate.sustainTable.config.pantsIdx,
                candidate.sustainTable.config.bootsIdx,
                candidate.sustainTable.config.foodIdx,
                candidate.combatTable.patternIndexes[candidate.combatBudget],
                candidate.sustainTable.patternIndexes[candidate.sustainBudget],
                candidate.lootLevel || 0,
            ].join("|");
        }

        function createCandidateRef(combatTable, sustainTable, combatBudget, sustainBudget, primary, netCost, campaignCost, simulation, lootLevel = 0) {
            const candidate = {
                combatTable,
                sustainTable,
                combatBudget,
                sustainBudget,
                lootLevel,
                primary,
                netCost,
                campaignCost,
                simulation,
                raw: null,
            };
            candidate.key = candidateKey(candidate);
            return candidate;
        }

        function materializeCandidate(candidate) {
            if (!candidate) return null;
            if (!candidate.raw) {
                candidate.raw = createExactRawBuild(
                    candidate.combatTable,
                    candidate.sustainTable,
                    combatPatterns,
                    sustainPatterns,
                    candidate.combatBudget,
                    candidate.sustainBudget,
                    options,
                    ctx,
                    candidate.lootLevel || 0
                );
            }
            return candidate.raw;
        }

        function betterCandidate(candidate, incumbent) {
            if (!candidate) return false;
            if (!incumbent) return true;
            const epsilon = Math.max(1, Math.abs(incumbent.primary)) * EXACT_TIE_EPSILON;
            if (candidate.primary > incumbent.primary + epsilon) return true;
            if (Math.abs(candidate.primary - incumbent.primary) <= epsilon) {
                return candidate.netCost < incumbent.netCost - EXACT_TIE_EPSILON;
            }
            return false;
        }

        function reindexAffordableCandidates() {
            affordableCandidateIndexes.clear();
            affordableCandidates.forEach((candidate, index) => {
                affordableCandidateIndexes.set(candidate.key, index);
            });
        }

        function addAffordableCandidate(candidate) {
            if (!candidate) return;
            const existingIndex = affordableCandidateIndexes.get(candidate.key);
            if (existingIndex != null) {
                if (betterCandidate(candidate, affordableCandidates[existingIndex])) {
                    affordableCandidates[existingIndex] = candidate;
                }
            } else {
                affordableCandidates.push(candidate);
            }
            affordableCandidates.sort((a, b) => {
                const primaryDelta = b.primary - a.primary;
                return primaryDelta || a.netCost - b.netCost;
            });
            affordableCandidates.splice(32);
            reindexAffordableCandidates();
        }

        function budgetTargetIndexesForCandidateValue(value) {
            const indexes = [];
            for (let i = 0; i < targetBuilds.length; i += 1) {
                const candidate = targetBuilds[i];
                if (!candidate) {
                    indexes.push(i);
                    continue;
                }
                const epsilon = Math.max(1, Math.abs(candidate.primary)) * EXACT_TIE_EPSILON;
                if (value > candidate.primary + epsilon) indexes.push(i);
            }
            return indexes;
        }

        function updateBudgetTargetCandidates(candidate, indexes) {
            for (const i of indexes) {
                if (candidate.campaignCost <= budgetTargets[i] && betterCandidate(candidate, targetBuilds[i])) {
                    targetBuilds[i] = candidate;
                }
            }
        }

        const sustainTables = [];
        for (let sustainIndex = sustainStart; sustainIndex < sustainEnd; sustainIndex += 1) {
            sustainTables.push(attachSustainEconomy(
                makeValueTable(sustainConfigs[sustainIndex], sustainPatterns, budget, sustainValueFn, ctx.rollSearch && !options.exactCampaignSearch),
                sustainPatterns,
                budget,
                options,
                ctx
            ));
            reportStage(0.3, 0.6, sustainIndex - sustainStart + 1, sustainEnd - sustainStart);
        }

        function sideCandidateKey(entry) {
            const config = entry.table.config;
            return [
                config.weaponIdx,
                config.helmetIdx,
                config.glovesIdx,
                config.ammoIdx,
                config.chestIdx,
                config.pantsIdx,
                config.bootsIdx,
                config.foodIdx,
                entry.table.patternIndexes[entry.budget],
            ].join("|");
        }

        function addSortedEntry(list, entry, limit, sorter) {
            const existingIndex = list.findIndex((item) => item.key === entry.key);
            if (existingIndex >= 0) {
                const existing = list[existingIndex];
                if (sorter(entry, existing) >= 0) return;
                list[existingIndex] = entry;
            } else {
                list.push(entry);
            }
            list.sort(sorter);
            if (list.length > limit) list.length = limit;
        }

        function mergeEntryLists(...lists) {
            const merged = [];
            const seen = new Set();
            for (const list of lists) {
                for (const entry of list) {
                    if (seen.has(entry.key)) continue;
                    seen.add(entry.key);
                    merged.push(entry);
                }
            }
            return merged;
        }

        function sampledCostValueFrontier(entries, limit) {
            if (entries instanceof Map) entries = Array.from(entries.values());
            if (!entries.length) return [];

            const sorted = entries.slice().sort((a, b) => (
                a.costHint - b.costHint || b.value - a.value
            ));
            const frontier = [];
            let bestValue = Number.NEGATIVE_INFINITY;
            for (const entry of sorted) {
                if (entry.value > bestValue + EXACT_TIE_EPSILON) {
                    frontier.push(entry);
                    bestValue = entry.value;
                }
            }

            if (frontier.length <= limit) return frontier;

            const sampled = [];
            const seen = new Set();
            for (let i = 0; i < limit; i += 1) {
                const index = Math.round(i * (frontier.length - 1) / Math.max(1, limit - 1));
                const entry = frontier[index];
                if (entry && !seen.has(entry.key)) {
                    seen.add(entry.key);
                    sampled.push(entry);
                }
            }
            return sampled;
        }

        function retainFrontierEntry(frontier, entry) {
            if (!(frontier instanceof Map)) { frontier.push(entry); return; }
            // Bounded price bands keep the roll search from retaining millions of
            // per-budget objects. Cheapest and strongest candidates are kept separately.
            const band = Math.sign(entry.costHint) * Math.floor(Math.log1p(Math.abs(entry.costHint)) * 64);
            const current = frontier.get(band);
            if (!current || entry.value > current.value || (entry.value === current.value && entry.costHint < current.costHint)) frontier.set(band, entry);
        }

        function buildCombatBudgetCandidates() {
            const byBudget = Array.from({ length: budget + 1 }, () => ({ value: [], cheap: [], frontier: ctx.rollSearch ? new Map() : [] }));
            const valueSorter = (a, b) => b.value - a.value || a.costHint - b.costHint;
            const cheapSorter = (a, b) => a.costHint - b.costHint || b.value - a.value;
            const caseIncomePerAttack = ctx.rewards.case1_price * 0.02 + ctx.rewards.case2_price * 0.0002;

            for (const [tableIndex, table] of combatTables.entries()) {
                for (let cost = 0; cost <= budget; cost += 1) {
                    const value = table.values[cost];
                    const prc = table.economy && table.economy.prc[cost];
                    if (!Number.isFinite(value) || !Number.isFinite(prc) || table.patternIndexes[cost] < 0) continue;
                    const economy = table.economy;
                    const costHint = economy.fixedAttackCost
                        + economy.dodgeAttackCost
                        - prc * caseIncomePerAttack;
                    const entry = {
                        table,
                        budget: cost,
                        value,
                        costHint,
                    };
                    entry.key = sideCandidateKey(entry);
                    addSortedEntry(byBudget[cost].value, entry, 16, valueSorter);
                    addSortedEntry(byBudget[cost].cheap, entry, 10, cheapSorter);
                    retainFrontierEntry(byBudget[cost].frontier, entry);
                }
                reportStage(0.6, 0.7, tableIndex + 1, combatTables.length);
            }

            return byBudget.map((bucket) => mergeEntryLists(
                bucket.value,
                bucket.cheap,
                sampledCostValueFrontier(bucket.frontier, 24)
            ));
        }

        function buildSustainBudgetCandidates() {
            const byBudget = Array.from({ length: budget + 1 }, () => ({ value: [], cheap: [], frontier: ctx.rollSearch ? new Map() : [] }));
            const valueSorter = (a, b) => b.value - a.value || a.costHint - b.costHint;
            const cheapSorter = (a, b) => a.costHint - b.costHint || b.value - a.value;

            for (const [tableIndex, table] of sustainTables.entries()) {
                for (let cost = 0; cost <= budget; cost += 1) {
                    const value = table.values[cost];
                    const economy = table.economy;
                    if (!Number.isFinite(value) || table.patternIndexes[cost] < 0) continue;
                    const costHint = economy.foodCost[cost]
                        + economy.sustainGearCost[cost];
                    const entry = {
                        table,
                        budget: cost,
                        value,
                        costHint,
                    };
                    entry.key = sideCandidateKey(entry);
                    addSortedEntry(byBudget[cost].value, entry, 16, valueSorter);
                    addSortedEntry(byBudget[cost].cheap, entry, 10, cheapSorter);
                    retainFrontierEntry(byBudget[cost].frontier, entry);
                }
                reportStage(0.7, 0.8, tableIndex + 1, sustainTables.length);
            }

            return byBudget.map((bucket) => mergeEntryLists(
                bucket.value,
                bucket.cheap,
                sampledCostValueFrontier(bucket.frontier, 24)
            ));
        }

        function considerCandidate(combatEntry, sustainEntry, lootLevel = 0) {
            const value = combatEntry.value * sustainEntry.value;
            if (!Number.isFinite(value) || value <= 0) return;

            const netCost = quickNetCostFromTables(
                combatEntry.table,
                sustainEntry.table,
                combatPatterns,
                sustainPatterns,
                combatEntry.budget,
                sustainEntry.budget,
                options,
                ctx,
                lootLevel
            );
            if (!Number.isFinite(netCost)) return;

            const campaignCost = campaignCostFromNetCost(netCost, options);
            const simulation = hasCampaignBudget
                ? simulateCampaignValues(netCost, value, options, false)
                : null;
            const candidate = createCandidateRef(
                combatEntry.table,
                sustainEntry.table,
                combatEntry.budget,
                sustainEntry.budget,
                value,
                netCost,
                campaignCost,
                simulation,
                lootLevel
            );

            if (betterCandidate(candidate, bestCandidate)) {
                bestValue = value;
                bestCandidate = candidate;
            }

            for (let i = 0; i < budgetTargets.length; i += 1) {
                if (candidate.campaignCost <= budgetTargets[i] && betterCandidate(candidate, targetBuilds[i])) {
                    targetBuilds[i] = candidate;
                }
            }

            for (let i = 0; i < frontierTargets.length; i += 1) {
                const score = candidateScoreForTarget(value, candidate.campaignCost, frontierTargets[i]);
                const current = frontierBuilds[i];
                if (
                    !current
                    || score > current.score + EXACT_TIE_EPSILON
                    || (Math.abs(score - current.score) <= EXACT_TIE_EPSILON && betterCandidate(candidate, current.candidate))
                ) {
                    frontierBuilds[i] = { score, candidate };
                }
            }

            if (hasCampaignBudget && simulation && simulation.sustainable) {
                if (betterCandidate(candidate, bestUnderCampaignBudgetCandidate)) {
                    bestUnderCampaignBudgetValue = value;
                    bestUnderCampaignBudgetCandidate = candidate;
                }
                addAffordableCandidate(candidate);
            }

            if (candidate.campaignCost < lowestCostValue) {
                lowestCostValue = candidate.campaignCost;
                lowestCostCandidate = candidate;
            }
        }

        function materializedSearchBuilds() {
            return [
                bestCandidate,
                bestUnderCampaignBudgetCandidate,
                lowestCostCandidate,
                ...affordableCandidates,
                ...targetBuilds,
                ...frontierBuilds.map((item) => item && item.candidate),
            ].filter(Boolean).map(materializeCandidate).filter(Boolean);
        }

        if (!options.exactCampaignSearch) {
            const combatBudgetCandidates = buildCombatBudgetCandidates();
            const sustainBudgetCandidates = buildSustainBudgetCandidates();
            const progressStep = (sustainEnd - sustainStart) * combatTables.length;
            if (ctx.rollSearch) {
                // Candidate entries retain the tables they need; release the full grids.
                combatTables.length = 0;
                sustainTables.length = 0;
            }
            for (const lootLevel of lootSkillLevels) {
                const remainingBudget = budget - SKILL_LEVEL_COST[lootLevel];
                for (let combatBudget = 0; combatBudget <= remainingBudget; combatBudget += 1) {
                    const sustainBudget = remainingBudget - combatBudget;
                    for (const combatEntry of combatBudgetCandidates[combatBudget]) {
                        for (const sustainEntry of sustainBudgetCandidates[sustainBudget]) {
                            considerCandidate(combatEntry, sustainEntry, lootLevel);
                        }
                    }
                    evaluated += progressStep;
                    if (onProgress && evaluated >= nextProgress) {
                        onProgress(Math.min(evaluated, totalChecks));
                        while (nextProgress <= evaluated) nextProgress += progressEvery;
                    }
                }
            }

            if (onProgress) onProgress(totalChecks);
            return {
                builds: materializedSearchBuilds(),
                evaluated: totalChecks,
                total: totalChecks,
            };
        }

        for (const sustainTable of sustainTables) {
            for (const combatTable of combatTables) {
                for (const lootLevel of lootSkillLevels) {
                    const remainingBudget = budget - SKILL_LEVEL_COST[lootLevel];
                    forEachUniqueBudgetSplit(combatTable, sustainTable, remainingBudget, (combatBudget, sustainBudget, value) => {
                        if (!Number.isFinite(value) || value <= 0) return;

                        const epsilon = Math.max(1, Math.abs(bestValue)) * EXACT_TIE_EPSILON;
                        const couldUpdateBest = value > bestValue + epsilon || Math.abs(value - bestValue) <= epsilon;
                        const budgetTargetIndexes = budgetTargetIndexesForCandidateValue(value);
                        let candidateNetCost = null;
                        let candidateSimulation = null;
                        let candidate = null;
                        const getCandidateNetCost = () => {
                            if (candidateNetCost == null) {
                                candidateNetCost = quickNetCostFromTables(
                                    combatTable,
                                    sustainTable,
                                    combatPatterns,
                                    sustainPatterns,
                                    combatBudget,
                                    sustainBudget,
                                    options,
                                    ctx,
                                    lootLevel
                                );
                            }
                            return candidateNetCost;
                        };
                        const getCandidateCampaignCost = () => campaignCostFromNetCost(getCandidateNetCost(), options);
                        const getCandidateSimulation = () => {
                            if (!candidateSimulation) {
                                candidateSimulation = simulateCampaignValues(getCandidateNetCost(), value, options, false);
                            }
                            return candidateSimulation;
                        };
                        const getCandidate = () => {
                            if (!candidate) {
                                candidate = createCandidateRef(
                                    combatTable,
                                    sustainTable,
                                    combatBudget,
                                    sustainBudget,
                                    value,
                                    getCandidateNetCost(),
                                    getCandidateCampaignCost(),
                                    hasCampaignBudget ? getCandidateSimulation() : null,
                                    lootLevel
                                );
                            }
                            return candidate;
                        };
                        if (budgetTargetIndexes.length) {
                            budgetTargetIndexes.splice(0, budgetTargetIndexes.length, ...budgetTargetIndexes.filter((index) => getCandidateCampaignCost() <= budgetTargets[index]));
                        }
                        const frontierIndexes = [];
                        if (frontierTargets.length) {
                            for (let i = 0; i < frontierTargets.length; i += 1) {
                                const score = candidateScoreForTarget(value, getCandidateCampaignCost(), frontierTargets[i]);
                                if (!frontierBuilds[i] || score > frontierBuilds[i].score + EXACT_TIE_EPSILON) {
                                    frontierIndexes.push(i);
                                }
                            }
                        }
                        let couldUpdateBestUnderCampaignBudget = false;
                        let couldUpdateLowestCost = false;
                        if (hasCampaignBudget) {
                            const candidateCampaignCost = getCandidateCampaignCost();
                            const bestUnderEpsilon = Number.isFinite(bestUnderCampaignBudgetValue)
                                ? Math.max(1, Math.abs(bestUnderCampaignBudgetValue)) * EXACT_TIE_EPSILON
                                : 0;
                            const lowestCostEpsilon = Number.isFinite(lowestCostValue)
                                ? Math.max(0.000001, Math.abs(lowestCostValue)) * 0.000001
                                : 0;
                            couldUpdateBestUnderCampaignBudget = getCandidateSimulation().sustainable
                                && value > bestUnderCampaignBudgetValue + bestUnderEpsilon;
                            couldUpdateLowestCost = candidateCampaignCost < lowestCostValue - lowestCostEpsilon;
                        }
                        if (couldUpdateBest || budgetTargetIndexes.length || frontierIndexes.length || couldUpdateBestUnderCampaignBudget || couldUpdateLowestCost) {
                            candidate = getCandidate();
                            if (couldUpdateBest && (!bestCandidate || value > bestValue + epsilon || betterCandidate(candidate, bestCandidate))) {
                                bestValue = value;
                                bestCandidate = candidate;
                            }
                            if (budgetTargetIndexes.length) {
                                updateBudgetTargetCandidates(candidate, budgetTargetIndexes);
                            }
                            for (const index of frontierIndexes) {
                                const score = candidateScoreForTarget(value, candidate.campaignCost, frontierTargets[index]);
                                const current = frontierBuilds[index];
                                if (
                                    !current
                                    || score > current.score + EXACT_TIE_EPSILON
                                    || (Math.abs(score - current.score) <= EXACT_TIE_EPSILON && betterCandidate(candidate, current.candidate))
                                ) {
                                    frontierBuilds[index] = { score, candidate };
                                }
                            }
                            if (
                                couldUpdateBestUnderCampaignBudget
                                && candidate.simulation
                                && candidate.simulation.sustainable
                                && betterCandidate(candidate, bestUnderCampaignBudgetCandidate)
                            ) {
                                bestUnderCampaignBudgetValue = value;
                                bestUnderCampaignBudgetCandidate = candidate;
                                addAffordableCandidate(candidate);
                            }
                            if (couldUpdateLowestCost && candidate.campaignCost < lowestCostValue) {
                                lowestCostValue = candidate.campaignCost;
                                lowestCostCandidate = candidate;
                            }
                        }
                    });

                    evaluated += remainingBudget + 1;
                }
                if (onProgress && evaluated >= nextProgress) {
                    onProgress(evaluated);
                    nextProgress += progressEvery;
                }
            }
        }

        if (hasCampaignBudget) {
            for (const lootLevel of lootSkillLevels) {
                const remainingBudget = budget - SKILL_LEVEL_COST[lootLevel];
                const sustainBudgetSamples = Array.from(new Set([
                    ...SKILL_LEVEL_COST,
                    Math.floor(remainingBudget * 0.25),
                    Math.floor(remainingBudget * 0.5),
                    Math.floor(remainingBudget * 0.75),
                ].filter((value) => value >= 0 && value <= remainingBudget))).sort((a, b) => a - b);

                for (const sustainTable of sustainTables) {
                    for (const sustainBudget of sustainBudgetSamples) {
                        const combatBudget = remainingBudget - sustainBudget;
                        for (const combatTable of combatTables) {
                            const value = combatTable.values[combatBudget] * sustainTable.values[sustainBudget];
                            if (!Number.isFinite(value) || value <= 0) continue;

                            const netCost = quickNetCostFromTables(
                                combatTable,
                                sustainTable,
                                combatPatterns,
                                sustainPatterns,
                                combatBudget,
                                sustainBudget,
                                options,
                                ctx,
                                lootLevel
                            );
                            const simulation = simulateCampaignValues(netCost, value, options, false);
                            if (!simulation.sustainable) continue;

                            const candidate = createCandidateRef(
                                combatTable,
                                sustainTable,
                                combatBudget,
                                sustainBudget,
                                value,
                                netCost,
                                campaignCostFromNetCost(netCost, options),
                                simulation,
                                lootLevel
                            );
                            addAffordableCandidate(candidate);
                            if (betterCandidate(candidate, bestUnderCampaignBudgetCandidate)) {
                                bestUnderCampaignBudgetValue = candidate.primary;
                                bestUnderCampaignBudgetCandidate = candidate;
                            }
                            if (candidate.campaignCost < lowestCostValue) {
                                lowestCostValue = candidate.campaignCost;
                                lowestCostCandidate = candidate;
                            }
                        }
                    }
                }
            }
        }

        if (onProgress) onProgress(totalChecks);

        return {
            builds: [
                bestCandidate,
                bestUnderCampaignBudgetCandidate,
                lowestCostCandidate,
                ...affordableCandidates,
                ...targetBuilds,
                ...frontierBuilds.map((item) => item && item.candidate),
            ].filter(Boolean).map(materializeCandidate).filter(Boolean),
            evaluated: totalChecks,
            total: totalChecks,
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
            const choice = build.gear_rolls ? build.gear_rolls[index] : gearAt(ctx, slot, build.gear_idx[index]);
            const tier = choice.tier;
            const imageName = slot === "weapon" ? tier : slot;
            const quantity = Math.max(0.01, gearDecayQuantityFromDiag(build.gear_idx, slot, build.diag));
            return {
                tier,
                image_name: imageName,
                slot,
                mods: { ...choice.mods },
                unit_cost: choice.cost,
                price_source: choice.priceSource || "tier-average",
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
        build.ammo_unit_cost = ctx.ammo[build.ammo_name].bullet_cost;
        build.food_unit_cost = ctx.food[build.food_name].cost;
        build.gear = gearEntries(build, ctx);
        build.gear_choice_idx = build.gear_idx.slice();
        build.gear_idx = build.gear_choice_idx.map((choice, index) => build.gear_rolls ? build.gear_rolls[index].tierIndex : gearAt(ctx, GEAR_SLOTS[index], choice).tierIndex);
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
        const costKey = options.costKey || "net_cost";
        const numBuilds = options.numBuilds || 19;

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

    function addUniqueBuild(builds, build) {
        if (!build) return;
        if (!builds.some((existing) => rawBuildKey(existing) === rawBuildKey(build))) {
            builds.push(build);
        }
    }

    function selectBudgetBuilds(allBuilds, options, bestBuild) {
        const selected = [];
        const targets = normalizedBudgetTargets(options);
        for (const target of targets) {
            const bestUnderTarget = allBuilds
                .filter((build) => campaignCostForBuild(build, options) <= target)
                .reduce((best, build) => betterExactBuild(build, best) ? build : best, null);
            addUniqueBuild(selected, bestUnderTarget);

            const closestToTarget = allBuilds
                .slice()
                .sort((a, b) => {
                    const aDistance = Math.abs(campaignCostForBuild(a, options) - target);
                    const bDistance = Math.abs(campaignCostForBuild(b, options) - target);
                    return aDistance - bDistance || exactPrimary(b) - exactPrimary(a);
                })[0];
            addUniqueBuild(selected, closestToTarget);
        }

        const campaignBudget = campaignBudgetLimit(options);
        if (Number.isFinite(campaignBudget)) {
            const overBudgetBuilds = allBuilds
                .filter((build) => !campaignIsBuildSustainable(build, options))
                .sort((a, b) => {
                    const aSimulation = simulateCampaignBuild(a, options);
                    const bSimulation = simulateCampaignBuild(b, options);
                    return aSimulation.largestShortfall - bSimulation.largestShortfall
                        || aSimulation.failedDay - bSimulation.failedDay
                        || campaignCostForBuild(a, options) - campaignCostForBuild(b, options)
                        || exactPrimary(b) - exactPrimary(a);
                });
            overBudgetBuilds.slice(0, 8).forEach((build) => addUniqueBuild(selected, build));
        }

        allBuilds
            .slice()
            .sort((a, b) => campaignCostForBuild(a, options) - campaignCostForBuild(b, options) || exactPrimary(b) - exactPrimary(a))
            .slice(0, 24)
            .forEach((build) => addUniqueBuild(selected, build));
        addUniqueBuild(selected, bestBuild);
        return selected.sort((a, b) => campaignCostForBuild(a, options) - campaignCostForBuild(b, options) || exactPrimary(b) - exactPrimary(a));
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
            .sort((a, b) => {
                const primaryDelta = exactPrimary(b) - exactPrimary(a);
                return primaryDelta || a.net_cost - b.net_cost;
            });

        if (!allBuilds.length) {
            return {
                builds: [],
                all_builds: [],
                max_damage_value: 0,
                max_net_cost_value: 0,
            };
        }

        const bestBuild = allBuilds.reduce((best, build) => betterExactBuild(build, best) ? build : best, null);
        bestBuild.is_highest_damage = true;
        bestBuild.is_max_damage = true;
        const maxDamageBuild = allBuilds.reduce((best, build) => build.total_damage > best.total_damage ? build : best);
        const maxDamageValue = Math.floor(maxDamageBuild.total_damage);
        const budgetTargets = normalizedBudgetTargets(options);
        const builds = budgetTargets.length
            ? selectBudgetBuilds(allBuilds, options, bestBuild)
            : selectBuilds(allBuilds, {
                minDamage: 50000,
                maxDamage: maxDamageValue,
                numBuilds: 19,
                costKey: "net_cost",
            });
        addUniqueBuild(builds, bestBuild);

        return {
            builds,
            all_builds: allBuilds,
            max_damage_value: maxDamageValue,
            max_net_cost_value: bestBuild.net_cost,
        };
    }

    function refineGearRolls(response, options, onProgress) {
        if (!options.priceOverrides?.searchGearRolls || !response.builds?.length) return response;
        const ctx = createModelContext(options.priceOverrides);
        const skillsPinned = pinnedArray(options, "pinnedSkills", 9);
        const rollPins = options.pinnedGearStats || [];
        const budget = skillBudget(options);
        const seeds = response.builds.slice();
        const refined = [];
        let evaluated = 0;
        for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
            const seed = seeds[seedIndex];
            let choices = seed.gear_rolls.map(item => ({ ...item, mods: { ...item.mods } }));
            let levels = seed.skill_lvls.slice();
            const currentCost = campaignCostForBuild(seed, options);
            const targets = normalizedBudgetTargets(options);
            const sustainable = Number.isFinite(campaignBudgetLimit(options)) && campaignIsBuildSustainable(seed, options);
            const target = sustainable ? campaignBudgetLimit(options)
                : seed.is_highest_damage ? Infinity : targets.find(value => value >= currentCost - 1e-8) ?? currentCost;

            function evaluate(candidateChoices, candidateLevels) {
                // Reuse indexes 0/1 while pricing and evaluating the actual selected rolls.
                const indexes = candidateChoices.map((choice, index) => {
                    const slot = GEAR_SLOTS[index];
                    ctx.gearChoices[slot] = [ctx.gear[slot].none, choice];
                    return choice.tierIndex === 0 ? 0 : 1;
                });
                ctx.gearCache.clear();
                const totals = computeTotals(candidateLevels, indexes, seed.ammo_idx, seed.food_idx, options, ctx);
                const econ = computeEconomics(candidateLevels, indexes, totals.totalCost, totals.diag, ctx);
                const candidate = createRawBuild({ skillLevels: candidateLevels, gearIdx: indexes, ammoIdx: seed.ammo_idx, foodIdx: seed.food_idx },
                    totals, econ, econ.net_cost / Math.max(1, totals.totalDamage));
                candidate.gear_rolls = candidateChoices.map(item => ({ ...item, mods: { ...item.mods } }));
                candidate.gear_idx = candidateChoices.map(item => item.tierIndex);
                evaluated += 1;
                return candidate;
            }

            function rolledChoice(slot, base, mods) {
                const ranges = ctx.rollRanges[slot][base.tier];
                return { ...base, mods,
                    cost: interpolateRollPrice(ctx.rollCurves[slot]?.[base.tier], rollQuality(mods, ranges), ctx.gear[slot][base.tier].cost) };
            }

            let best = evaluate(choices, levels);
            const acceptable = candidate => (
                campaignCostForBuild(candidate, options) <= target + 1e-8
                && (!sustainable || campaignIsBuildSustainable(candidate, options))
                && betterExactBuild(candidate, best)
            );
            // Multistart coordinate refinement preserves every original build. Four passes
            // bound runtime; this improves sampled candidates, not a global-optimum proof.
            for (let pass = 0; pass < 4; pass += 1) {
                let changed = false;
                for (let index = 0; index < 6; index += 1) {
                    const slot = GEAR_SLOTS[index], base = choices[index];
                    if (!base.tierIndex || rollPins[index]) continue;
                    const ranges = ctx.rollRanges[slot][base.tier];
                    if ((ctx.rollCurves[slot]?.[base.tier]?.length || 0) < 2) continue;
                    let rollOptions = [{}];
                    for (const [stat, [min, max]] of Object.entries(ranges)) {
                        rollOptions = rollOptions.flatMap(mods => Array.from({ length: max - min + 1 }, (_, offset) => ({ ...mods, [stat]: min + offset })));
                    }
                    for (const mods of rollOptions) {
                        const trial = choices.slice();
                        trial[index] = rolledChoice(slot, base, mods);
                        const candidate = evaluate(trial, levels);
                        if (acceptable(candidate)) { best = candidate; choices = trial; changed = true; }
                    }
                }
                // Redistribute skill points after changing rolls, including overflow bonuses.
                for (let left = 0; left < 9; left += 1) {
                    if (skillsPinned[left] !== null) continue;
                    for (let right = left + 1; right < 9; right += 1) {
                        if (skillsPinned[right] !== null) continue;
                        const otherCost = skillCost(levels) - SKILL_LEVEL_COST[levels[left]] - SKILL_LEVEL_COST[levels[right]];
                        for (let a = 0; a <= 10; a += 1) {
                            for (let b = 0; b <= 10; b += 1) {
                                if (otherCost + SKILL_LEVEL_COST[a] + SKILL_LEVEL_COST[b] > budget) continue;
                                if ((left === 8 && a > 0 || right === 8 && b > 0) && !usesLootSkillBudget(options)) continue;
                                const trial = levels.slice(); trial[left] = a; trial[right] = b;
                                const candidate = evaluate(choices, trial);
                                if (acceptable(candidate)) { best = candidate; levels = trial; changed = true; }
                            }
                        }
                    }
                }
                if (!changed) break;
            }
            refined.push(best);
            if (onProgress) onProgress({ phase: "roll-refinement", completed: seedIndex + 1, total: seeds.length });
        }
        const result = prepareResponse([{ builds: [...response.all_builds, ...refined] }], options);
        result.gear_search = { method: "endpoint-grid-and-integer-refinement", evaluated,
            market: options.priceOverrides.gearMarketMeta || null };
        return result;
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
            GEAR_STAT_RANGES,
        },
        createModelContext,
        rollQuality,
        interpolateRollPrice,
        computeTotals,
        getSearchPlan,
        simulateCampaignValues,
        simulateCampaignBuild,
        runSearch,
        prepareResponse,
        refineGearRolls,
        formatNumber,
    };
})(typeof globalThis !== "undefined" ? globalThis : this);
