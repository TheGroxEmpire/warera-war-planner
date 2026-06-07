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

    const EXACT_TIE_EPSILON = 1e-10;

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
        return Math.max(0, Math.floor((options.adjustedLevel || 0) * SKILL_POINTS_PER_LEVEL));
    }

    function damageCombatConfigCount() {
        const ammoChoices = WEAPON_TIERS.reduce((sum, _, weaponIdx) => {
            return sum + (weaponIdx <= 1 ? 1 : AMMO_NAMES.length - 1);
        }, 0);
        return ammoChoices * GEAR_TIERS.length * GEAR_TIERS.length;
    }

    function getSearchPlan(options) {
        const budget = skillBudget(options);
        const combatCount = options.objective === "cases" ? GEAR_TIERS.length : damageCombatConfigCount();
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

    function makeCaseCombatPatterns(budget) {
        const patterns = [];
        for (let prc = 0; prc <= MAX_SKILL_LEVEL; prc += 1) {
            for (let loot = 0; loot <= MAX_SKILL_LEVEL; loot += 1) {
                const cost = SKILL_LEVEL_COST[prc] + SKILL_LEVEL_COST[loot];
                if (cost <= budget) patterns.push({ cost, levels: [prc, loot] });
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

    function makeCaseCombatConfigs(ctx) {
        const configs = [];
        for (let glovesIdx = 0; glovesIdx < GEAR_TIERS.length; glovesIdx += 1) {
            const gloves = ctx.gear.gloves[GEAR_TIERS[glovesIdx]];
            configs.push({
                weaponIdx: 0,
                helmetIdx: 0,
                glovesIdx,
                ammoIdx: 0,
                basePrc: BASELINE.prc + modValue(gloves, "prc"),
            });
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

    function caseCombatValue(config, levels) {
        const prc = Math.min(1.0, config.basePrc / 100 + 0.05 * levels[0]);
        const loot = 0.02 + 0.02 * levels[1];
        return prc * loot;
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

        return { config, values, patternIndexes };
    }

    function exactPrimary(build, objective) {
        return objective === "cases" ? build.cases_per_day : build.total_damage;
    }

    function betterExactBuild(candidate, incumbent, objective) {
        if (!candidate) return false;
        if (!incumbent) return true;
        const candidatePrimary = exactPrimary(candidate, objective);
        const incumbentPrimary = exactPrimary(incumbent, objective);
        const epsilon = Math.max(1, Math.abs(incumbentPrimary)) * EXACT_TIE_EPSILON;
        if (candidatePrimary > incumbentPrimary + epsilon) return true;
        if (Math.abs(candidatePrimary - incumbentPrimary) <= epsilon) {
            return candidate.net_cost < incumbent.net_cost - EXACT_TIE_EPSILON;
        }
        return false;
    }

    function budgetTargetIndexesForValue(value, targetBuilds, objective) {
        const indexes = [];
        for (let i = 0; i < targetBuilds.length; i += 1) {
            const build = targetBuilds[i];
            if (!build) {
                indexes.push(i);
                continue;
            }
            const currentPrimary = exactPrimary(build, objective);
            const epsilon = Math.max(1, Math.abs(currentPrimary)) * EXACT_TIE_EPSILON;
            if (value > currentPrimary + epsilon) indexes.push(i);
        }
        return indexes;
    }

    function updateBudgetTargetBuilds(raw, targets, targetBuilds, objective, indexes) {
        for (const i of indexes) {
            if (raw.net_cost <= targets[i] && betterExactBuild(raw, targetBuilds[i], objective)) {
                targetBuilds[i] = raw;
            }
        }
    }

    function quickNetCost(combatTable, sustainTable, combatPatterns, sustainPatterns, combatBudget, sustainBudget, objective, options, ctx) {
        const combatPattern = combatPatterns[combatTable.patternIndexes[combatBudget]];
        const sustainPattern = sustainPatterns[sustainTable.patternIndexes[sustainBudget]];
        if (!combatPattern || !sustainPattern) return Number.POSITIVE_INFINITY;

        const sustain = sustainStats(sustainTable.config, sustainPattern.levels, options);
        const dodgeDecay = 1 - sustain.ddg / (sustain.ddg + 40);
        const dayMultiplier = options.pill ? 1.8 : 2.4;
        const foodCost = sustainTable.config.food.cost * sustain.hun * dayMultiplier;
        const pillCost = options.pill ? ctx.rewards.pill_price : 0.0;
        const ammoIdx = objective === "cases" ? 0 : combatTable.config.ammoIdx;
        const ammoCost = ctx.ammo[AMMO_NAMES[ammoIdx]].bullet_cost * sustain.attacks;

        const weaponIdx = objective === "cases" ? 0 : combatTable.config.weaponIdx;
        const helmetIdx = objective === "cases" ? 0 : combatTable.config.helmetIdx;
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

        let prc;
        let loot;
        if (objective === "cases") {
            prc = Math.min(1.0, combatTable.config.basePrc / 100 + 0.05 * combatPattern.levels[0]);
            loot = 0.02 + 0.02 * combatPattern.levels[1];
        } else {
            prc = Math.min(1.0, combatTable.config.basePrc / 100 + 0.05 * combatPattern.levels[1]);
            loot = 0.02;
        }
        const casesPerDay = loot * sustain.attacks * prc;
        const eliteCasesPerDay = (loot / 100) * sustain.attacks * prc;
        const totalCost = gearCost + foodCost + ammoCost + pillCost;
        return totalCost
            - scrapGenerated * ctx.rewards.scrap_price
            - casesPerDay * ctx.rewards.case1_price
            - eliteCasesPerDay * ctx.rewards.case2_price;
    }

    function createExactRawBuild(combatTable, sustainTable, combatPatterns, sustainPatterns, combatBudget, sustainBudget, objective, options, ctx) {
        const combatPattern = combatPatterns[combatTable.patternIndexes[combatBudget]];
        const sustainPattern = sustainPatterns[sustainTable.patternIndexes[sustainBudget]];
        if (!combatPattern || !sustainPattern) return null;

        let skillLevels;
        let gearIdx;
        let ammoIdx;
        if (objective === "cases") {
            skillLevels = [
                0,
                combatPattern.levels[0],
                0,
                0,
                sustainPattern.levels[0],
                sustainPattern.levels[1],
                sustainPattern.levels[2],
                sustainPattern.levels[3],
                combatPattern.levels[1],
            ];
            gearIdx = [
                0,
                0,
                combatTable.config.glovesIdx,
                sustainTable.config.chestIdx,
                sustainTable.config.pantsIdx,
                sustainTable.config.bootsIdx,
            ];
            ammoIdx = 0;
        } else {
            skillLevels = [
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
            gearIdx = [
                combatTable.config.weaponIdx,
                combatTable.config.helmetIdx,
                combatTable.config.glovesIdx,
                sustainTable.config.chestIdx,
                sustainTable.config.pantsIdx,
                sustainTable.config.bootsIdx,
            ];
            ammoIdx = combatTable.config.ammoIdx;
        }

        const candidate = {
            skillLevels,
            gearIdx,
            ammoIdx,
            foodIdx: sustainTable.config.foodIdx,
        };
        const totals = computeTotals(candidate.skillLevels, candidate.gearIdx, candidate.ammoIdx, candidate.foodIdx, options, ctx);
        const econ = computeEconomics(candidate.skillLevels, candidate.gearIdx, totals.totalCost, totals.diag, ctx);
        const primary = objective === "cases" ? econ.cases_per_day : totals.totalDamage;
        const denominator = Math.max(primary, objective === "cases" ? 0.001 : 1);
        return createRawBuild(candidate, totals, econ, econ.net_cost / denominator);
    }

    function runSearch(options, onProgress) {
        const ctx = createModelContext(options.priceOverrides);
        const plan = getSearchPlan(options);
        const budget = plan.budget;
        const combatConfigs = options.objective === "cases" ? makeCaseCombatConfigs(ctx) : makeDamageCombatConfigs(ctx);
        const sustainConfigs = makeSustainConfigs(ctx);
        const combatPatterns = options.objective === "cases" ? makeCaseCombatPatterns(budget) : makeDamageCombatPatterns(budget);
        const sustainPatterns = makeSustainPatterns(budget);
        const combatValueFn = options.objective === "cases"
            ? (config, levels) => caseCombatValue(config, levels)
            : (config, levels) => damageCombatValue(config, levels, options);
        const sustainValueFn = (config, levels) => sustainValue(config, levels, options);
        const combatTables = combatConfigs.map((config) => makeValueTable(config, combatPatterns, budget, combatValueFn));
        const sustainStart = Math.max(0, Math.min(sustainConfigs.length, Math.floor(options.sustainStart || 0)));
        const sustainEnd = Math.max(sustainStart, Math.min(sustainConfigs.length, Math.floor(options.sustainEnd == null ? sustainConfigs.length : options.sustainEnd)));
        const budgetTargets = normalizedBudgetTargets(options);
        const targetBuilds = Array(budgetTargets.length).fill(null);
        const totalChecks = (sustainEnd - sustainStart) * combatTables.length * (budget + 1);
        const progressEvery = Math.max(1000, Math.floor(totalChecks / 100));
        let nextProgress = progressEvery;
        let evaluated = 0;
        let bestValue = Number.NEGATIVE_INFINITY;
        let bestBuild = null;

        for (let sustainIndex = sustainStart; sustainIndex < sustainEnd; sustainIndex += 1) {
            const sustainTable = makeValueTable(sustainConfigs[sustainIndex], sustainPatterns, budget, sustainValueFn);
            for (const combatTable of combatTables) {
                for (let combatBudget = 0; combatBudget <= budget; combatBudget += 1) {
                    const sustainBudget = budget - combatBudget;
                    const value = combatTable.values[combatBudget] * sustainTable.values[sustainBudget];
                    if (Number.isFinite(value) && value > 0) {
                        const epsilon = Math.max(1, Math.abs(bestValue)) * EXACT_TIE_EPSILON;
                        const couldUpdateBest = value > bestValue + epsilon || Math.abs(value - bestValue) <= epsilon;
                        const budgetTargetIndexes = budgetTargetIndexesForValue(value, targetBuilds, options.objective);
                        let raw = null;
                        if (budgetTargetIndexes.length) {
                            const netCost = quickNetCost(
                                combatTable,
                                sustainTable,
                                combatPatterns,
                                sustainPatterns,
                                combatBudget,
                                sustainBudget,
                                options.objective,
                                options,
                                ctx
                            );
                            budgetTargetIndexes.splice(0, budgetTargetIndexes.length, ...budgetTargetIndexes.filter((index) => netCost <= budgetTargets[index]));
                        }
                        if (couldUpdateBest || budgetTargetIndexes.length) {
                            raw = createExactRawBuild(
                                combatTable,
                                sustainTable,
                                combatPatterns,
                                sustainPatterns,
                                combatBudget,
                                sustainBudget,
                                options.objective,
                                options,
                                ctx
                            );
                            if (couldUpdateBest && (value > bestValue + epsilon || betterExactBuild(raw, bestBuild, options.objective))) {
                                bestValue = value;
                                bestBuild = raw;
                            }
                            if (budgetTargetIndexes.length) {
                                updateBudgetTargetBuilds(raw, budgetTargets, targetBuilds, options.objective, budgetTargetIndexes);
                            }
                        }
                    }
                }

                evaluated += budget + 1;
                if (onProgress && evaluated >= nextProgress) {
                    onProgress(evaluated);
                    nextProgress += progressEvery;
                }
            }
        }

        if (onProgress) onProgress(totalChecks);

        return {
            builds: [bestBuild, ...targetBuilds].filter(Boolean),
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
                .filter((build) => build.net_cost <= target)
                .reduce((best, build) => betterExactBuild(build, best, options.objective) ? build : best, null);
            addUniqueBuild(selected, bestUnderTarget);
        }

        const dailyBudget = Number(options.dailyBudget);
        if (Number.isFinite(dailyBudget)) {
            const closestOverBudget = allBuilds
                .filter((build) => build.net_cost > dailyBudget)
                .sort((a, b) => a.net_cost - b.net_cost || exactPrimary(b, options.objective) - exactPrimary(a, options.objective))[0];
            addUniqueBuild(selected, closestOverBudget);
        }

        addUniqueBuild(selected, bestBuild);
        return selected.sort((a, b) => a.net_cost - b.net_cost || exactPrimary(b, options.objective) - exactPrimary(a, options.objective));
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
                const primaryDelta = exactPrimary(b, options.objective) - exactPrimary(a, options.objective);
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

        const bestBuild = allBuilds.reduce((best, build) => betterExactBuild(build, best, options.objective) ? build : best, null);
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
                metric: options.objective,
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
        runSearch,
        prepareResponse,
        formatNumber,
    };
})(typeof globalThis !== "undefined" ? globalThis : this);
