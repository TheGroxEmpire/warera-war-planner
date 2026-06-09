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
    const MAX_OPTIMIZED_SKILL_BUDGET = MAX_DAMAGE_SKILL_BUDGET + MAX_SUSTAIN_SKILL_BUDGET;

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

    const EXACT_TIE_EPSILON = 1e-10;
    const campaignSimulationCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;

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

    function modValue(item, stat) {
        return item && item.mods && Number.isFinite(item.mods[stat]) ? item.mods[stat] : 0;
    }

    function skillBudget(options) {
        const budget = Math.max(0, Math.floor((options.adjustedLevel || 0) * SKILL_POINTS_PER_LEVEL));
        return Math.min(budget, MAX_OPTIMIZED_SKILL_BUDGET);
    }

    function damageCombatConfigCount() {
        const ammoChoices = WEAPON_TIERS.reduce((sum, _, weaponIdx) => {
            return sum + (weaponIdx <= 1 ? 1 : AMMO_NAMES.length - 1);
        }, 0);
        return ammoChoices * GEAR_TIERS.length * GEAR_TIERS.length;
    }

    function getSearchPlan(options) {
        const budget = skillBudget(options);
        const combatCount = damageCombatConfigCount();
        const sustainCount = GEAR_TIERS.length * GEAR_TIERS.length * GEAR_TIERS.length * FOOD_NAMES.length;
        return {
            budget,
            combatCount,
            sustainCount,
            checks: combatCount * sustainCount * (budget + 1),
        };
    }

    function normalizedBudgetTargets(options) {
        const targets = Array.isArray(options.budgetTargets) ? options.budgetTargets : [];
        return Array.from(new Set(targets
            .map((target) => Number(target))
            .filter((target) => Number.isFinite(target))))
            .sort((a, b) => a - b);
    }

    function makeDamageCombatPatterns(budget) {
        const patterns = [];
        for (let atk = 0; atk <= MAX_SKILL_LEVEL; atk += 1) {
            for (let prc = 0; prc <= MAX_SKILL_LEVEL; prc += 1) {
                for (let critc = 0; critc <= MAX_SKILL_LEVEL; critc += 1) {
                    for (let critd = 0; critd <= MAX_SKILL_LEVEL; critd += 1) {
                        const cost = SKILL_LEVEL_COST[atk] + SKILL_LEVEL_COST[prc] + SKILL_LEVEL_COST[critc] + SKILL_LEVEL_COST[critd];
                        if (cost <= budget) patterns.push({ cost, levels: [atk, prc, critc, critd] });
                    }
                }
            }
        }
        return patterns;
    }

    function makeSustainPatterns(budget) {
        const patterns = [];
        for (let arm = 0; arm <= MAX_SKILL_LEVEL; arm += 1) {
            for (let ddg = 0; ddg <= MAX_SKILL_LEVEL; ddg += 1) {
                for (let hp = 0; hp <= MAX_SKILL_LEVEL; hp += 1) {
                    for (let hun = 0; hun <= MAX_SKILL_LEVEL; hun += 1) {
                        const cost = SKILL_LEVEL_COST[arm] + SKILL_LEVEL_COST[ddg] + SKILL_LEVEL_COST[hp] + SKILL_LEVEL_COST[hun];
                        if (cost <= budget) patterns.push({ cost, levels: [arm, ddg, hp, hun] });
                    }
                }
            }
        }
        return patterns;
    }

    function makeDamageCombatConfigs(ctx) {
        const configs = [];
        for (let weaponIdx = 0; weaponIdx < WEAPON_TIERS.length; weaponIdx += 1) {
            const weapon = ctx.gear.weapon[WEAPON_TIERS[weaponIdx]];
            const ammoIndexes = weaponIdx <= 1 ? [0] : [1, 2, 3];
            for (let helmetIdx = 0; helmetIdx < GEAR_TIERS.length; helmetIdx += 1) {
                const helmet = ctx.gear.helmet[GEAR_TIERS[helmetIdx]];
                for (let glovesIdx = 0; glovesIdx < GEAR_TIERS.length; glovesIdx += 1) {
                    const gloves = ctx.gear.gloves[GEAR_TIERS[glovesIdx]];
                    for (const ammoIdx of ammoIndexes) {
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

    function makeSustainConfigs(ctx) {
        const configs = [];
        for (let chestIdx = 0; chestIdx < GEAR_TIERS.length; chestIdx += 1) {
            const chest = ctx.gear.chest[GEAR_TIERS[chestIdx]];
            for (let pantsIdx = 0; pantsIdx < GEAR_TIERS.length; pantsIdx += 1) {
                const pants = ctx.gear.pants[GEAR_TIERS[pantsIdx]];
                for (let bootsIdx = 0; bootsIdx < GEAR_TIERS.length; bootsIdx += 1) {
                    const boots = ctx.gear.boots[GEAR_TIERS[bootsIdx]];
                    for (let foodIdx = 0; foodIdx < FOOD_NAMES.length; foodIdx += 1) {
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

    function makeValueTable(config, patterns, budget, valueFn) {
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
        if (budget >= 0) {
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
        const weapon = ctx.gear.weapon[WEAPON_TIERS[config.weaponIdx]];
        const helmet = ctx.gear.helmet[GEAR_TIERS[config.helmetIdx]];
        const gloves = ctx.gear.gloves[GEAR_TIERS[config.glovesIdx]];
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
        const chest = ctx.gear.chest[GEAR_TIERS[config.chestIdx]];
        const pants = ctx.gear.pants[GEAR_TIERS[config.pantsIdx]];
        const boots = ctx.gear.boots[GEAR_TIERS[config.bootsIdx]];
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
        const campaignBudget = Number(options.campaignBudget);
        if (Number.isFinite(campaignBudget)) return campaignBudget;
        const dailyBudget = Number(options.dailyBudget);
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
        if (!Number.isFinite(Number(options.campaignBudget))) return netCost;
        const days = campaignWarDays(options);
        return netCost * days;
    }

    function campaignDayShortfall(initialStockpile, dailySpend, dailyIncome, day) {
        const delta = dailyIncome - dailySpend;
        const startingStockpile = initialStockpile + (day - 1) * delta;
        const endingStockpile = initialStockpile + day * delta;
        const spendShortfall = Math.max(0, dailySpend - startingStockpile);
        const endingShortfall = endingStockpile < -0.000001 ? -endingStockpile : 0;
        return Math.max(spendShortfall, endingShortfall);
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
        const dailyBountyIncome = bountyIncomeForDamage(totalDamage, options);
        const dailyBattleLootIncome = battleLootIncomeForDamage(totalDamage, options);
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
                const spendShortfall = Math.max(0, dailySpend - startingStockpile);
                const endingShortfall = stockpile < -0.000001 ? -stockpile : 0;
                const shortfall = Math.max(spendShortfall, endingShortfall);
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
        return Number.isFinite(Number(options.campaignBudget))
            ? simulateCampaignBuild(build, options).warTotalCost
            : Number(build.net_cost) || 0;
    }

    function campaignBudgetForBuild(build, options) {
        return Number.isFinite(Number(options.campaignBudget))
            ? simulateCampaignBuild(build, options).availableBudget
            : campaignBudgetLimit(options);
    }

    function campaignIsBuildSustainable(build, options) {
        return Number.isFinite(Number(options.campaignBudget))
            ? simulateCampaignBuild(build, options).sustainable
            : campaignCostForBuild(build, options) <= campaignBudgetLimit(options);
    }

    function quickNetCost(combatTable, sustainTable, combatPatterns, sustainPatterns, combatBudget, sustainBudget, options, ctx) {
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
            ["weapon", WEAPON_TIERS[weaponIdx], 1.0],
            ["helmet", GEAR_TIERS[helmetIdx], dodgeDecay],
            ["gloves", GEAR_TIERS[glovesIdx], dodgeDecay],
            ["chest", GEAR_TIERS[sustainTable.config.chestIdx], dodgeDecay],
            ["pants", GEAR_TIERS[sustainTable.config.pantsIdx], dodgeDecay],
            ["boots", GEAR_TIERS[sustainTable.config.bootsIdx], dodgeDecay],
        ];

        let gearCost = 0.0;
        let scrapGenerated = 0.0;
        for (const [slot, tier, decayMultiplier] of gearParts) {
            const gear = ctx.gear[slot][tier];
            gearCost += (gear.cost / 100) * sustain.attacks * decayMultiplier;
            const quantity = Math.max(0.01, Math.round((sustain.attacks * decayMultiplier / 100) * 100) / 100);
            scrapGenerated += (gear.scrap / 3) * quantity;
        }

        const prc = Math.min(1.0, combatTable.config.basePrc / 100 + 0.05 * combatPattern.levels[1]);
        const loot = 0.02;
        const casesPerDay = loot * sustain.attacks * prc;
        const eliteCasesPerDay = (loot / 100) * sustain.attacks * prc;
        const totalCost = gearCost + foodCost + ammoCost + pillCost;
        return totalCost
            - scrapGenerated * ctx.rewards.scrap_price
            - casesPerDay * ctx.rewards.case1_price
            - eliteCasesPerDay * ctx.rewards.case2_price;
    }

    function quickNetCostFromTables(combatTable, sustainTable, combatPatterns, sustainPatterns, combatBudget, sustainBudget, options, ctx) {
        const combatEconomy = combatTable.economy;
        const sustainEconomy = sustainTable.economy;
        if (!combatEconomy || !sustainEconomy) {
            return quickNetCost(combatTable, sustainTable, combatPatterns, sustainPatterns, combatBudget, sustainBudget, options, ctx);
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
        const casesPerDay = 0.02 * attacks * prc;
        const eliteCasesPerDay = 0.0002 * attacks * prc;

        return totalCost
            - scrapGenerated * ctx.rewards.scrap_price
            - casesPerDay * ctx.rewards.case1_price
            - eliteCasesPerDay * ctx.rewards.case2_price;
    }

    function createExactRawBuild(combatTable, sustainTable, combatPatterns, sustainPatterns, combatBudget, sustainBudget, options, ctx) {
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
            0,
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
        return createRawBuild(candidate, totals, econ, econ.net_cost / denominator);
    }

    function runBestDamageSearch(options, onProgress, ctx, plan, budget, combatTables, sustainConfigs, combatPatterns, sustainPatterns, sustainValueFn) {
        const sustainStart = Math.max(0, Math.min(sustainConfigs.length, Math.floor(options.sustainStart || 0)));
        const sustainEnd = Math.max(sustainStart, Math.min(sustainConfigs.length, Math.floor(options.sustainEnd == null ? sustainConfigs.length : options.sustainEnd)));
        const evaluated = (sustainEnd - sustainStart) * plan.combatCount * (budget + 1);
        const bestCombatByBudget = Array(budget + 1).fill(null);
        const bestSustainByBudget = Array(budget + 1).fill(null);

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
            const table = makeValueTable(sustainConfigs[sustainIndex], sustainPatterns, budget, sustainValueFn);
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

        if (onProgress) onProgress(evaluated);
        return {
            builds: bestBuild ? [bestBuild] : [],
            evaluated,
            total: evaluated,
        };
    }

    function runSearch(options, onProgress) {
        const ctx = createModelContext(options.priceOverrides);
        const plan = getSearchPlan(options);
        const budget = plan.budget;
        const combatConfigs = makeDamageCombatConfigs(ctx);
        const sustainConfigs = makeSustainConfigs(ctx);
        const combatPatterns = makeDamageCombatPatterns(budget);
        const sustainPatterns = makeSustainPatterns(budget);
        const combatValueFn = (config, levels) => damageCombatValue(config, levels, options);
        const sustainValueFn = (config, levels) => sustainValue(config, levels, options);
        const sustainStart = Math.max(0, Math.min(sustainConfigs.length, Math.floor(options.sustainStart || 0)));
        const sustainEnd = Math.max(sustainStart, Math.min(sustainConfigs.length, Math.floor(options.sustainEnd == null ? sustainConfigs.length : options.sustainEnd)));
        const budgetTargets = normalizedBudgetTargets(options);
        const campaignBudget = campaignBudgetLimit(options);
        const hasCampaignBudget = Number.isFinite(campaignBudget);
        const needsCandidateCosts = hasCampaignBudget || budgetTargets.length > 0;
        const combatTables = combatConfigs.map((config) => {
            const table = makeValueTable(config, combatPatterns, budget, combatValueFn);
            return needsCandidateCosts ? attachCombatEconomy(table, combatPatterns, budget, ctx) : table;
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
                sustainValueFn
            );
        }

        const targetBuilds = Array(budgetTargets.length).fill(null);
        const frontierTargets = budgetTargets.length ? budgetTargets : [];
        const frontierBuilds = Array(frontierTargets.length).fill(null);
        const totalChecks = (sustainEnd - sustainStart) * combatTables.length * (budget + 1);
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
            ].join("|");
        }

        function createCandidateRef(combatTable, sustainTable, combatBudget, sustainBudget, primary, netCost, campaignCost, simulation) {
            const candidate = {
                combatTable,
                sustainTable,
                combatBudget,
                sustainBudget,
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
                    ctx
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
                makeValueTable(sustainConfigs[sustainIndex], sustainPatterns, budget, sustainValueFn),
                sustainPatterns,
                budget,
                options,
                ctx
            ));
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

        function buildCombatBudgetCandidates() {
            const byBudget = Array.from({ length: budget + 1 }, () => ({ value: [], cheap: [] }));
            const valueSorter = (a, b) => b.value - a.value || a.costHint - b.costHint;
            const cheapSorter = (a, b) => a.costHint - b.costHint || b.value - a.value;
            const caseIncomePerAttack = ctx.rewards.case1_price * 0.02 + ctx.rewards.case2_price * 0.0002;

            for (const table of combatTables) {
                for (let cost = 0; cost <= budget; cost += 1) {
                    const value = table.values[cost];
                    const prc = table.economy && table.economy.prc[cost];
                    if (!Number.isFinite(value) || !Number.isFinite(prc) || table.patternIndexes[cost] < 0) continue;
                    const economy = table.economy;
                    const costHint = economy.fixedAttackCost
                        + economy.dodgeAttackCost
                        - (economy.weaponScrap + economy.dodgeScrap) * ctx.rewards.scrap_price
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
                }
            }

            return byBudget.map((bucket) => mergeEntryLists(bucket.value, bucket.cheap));
        }

        function buildSustainBudgetCandidates() {
            const byBudget = Array.from({ length: budget + 1 }, () => ({ value: [], cheap: [] }));
            const valueSorter = (a, b) => b.value - a.value || a.costHint - b.costHint;
            const cheapSorter = (a, b) => a.costHint - b.costHint || b.value - a.value;

            for (const table of sustainTables) {
                for (let cost = 0; cost <= budget; cost += 1) {
                    const value = table.values[cost];
                    const economy = table.economy;
                    if (!Number.isFinite(value) || table.patternIndexes[cost] < 0) continue;
                    const costHint = economy.foodCost[cost]
                        + economy.sustainGearCost[cost]
                        - economy.sustainScrap[cost] * ctx.rewards.scrap_price;
                    const entry = {
                        table,
                        budget: cost,
                        value,
                        costHint,
                    };
                    entry.key = sideCandidateKey(entry);
                    addSortedEntry(byBudget[cost].value, entry, 16, valueSorter);
                    addSortedEntry(byBudget[cost].cheap, entry, 10, cheapSorter);
                }
            }

            return byBudget.map((bucket) => mergeEntryLists(bucket.value, bucket.cheap));
        }

        function considerCandidate(combatEntry, sustainEntry) {
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
                ctx
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
                simulation
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
            for (let combatBudget = 0; combatBudget <= budget; combatBudget += 1) {
                const sustainBudget = budget - combatBudget;
                for (const combatEntry of combatBudgetCandidates[combatBudget]) {
                    for (const sustainEntry of sustainBudgetCandidates[sustainBudget]) {
                        considerCandidate(combatEntry, sustainEntry);
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
                forEachUniqueBudgetSplit(combatTable, sustainTable, budget, (combatBudget, sustainBudget, value) => {
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
                                ctx
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
                                hasCampaignBudget ? getCandidateSimulation() : null
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

                evaluated += budget + 1;
                if (onProgress && evaluated >= nextProgress) {
                    onProgress(evaluated);
                    nextProgress += progressEvery;
                }
            }
        }

        if (hasCampaignBudget) {
            const sustainBudgetSamples = Array.from(new Set([
                ...SKILL_LEVEL_COST,
                Math.floor(budget * 0.25),
                Math.floor(budget * 0.5),
                Math.floor(budget * 0.75),
            ].filter((value) => value >= 0 && value <= budget))).sort((a, b) => a - b);

            for (const sustainTable of sustainTables) {
                for (const sustainBudget of sustainBudgetSamples) {
                    const combatBudget = budget - sustainBudget;
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
                            ctx
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
                            simulation
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
        getSearchPlan,
        simulateCampaignValues,
        simulateCampaignBuild,
        runSearch,
        prepareResponse,
        formatNumber,
    };
})(typeof globalThis !== "undefined" ? globalThis : this);
