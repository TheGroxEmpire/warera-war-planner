from flask import Flask, render_template, request, jsonify
import numpy as np
import os
import logging
from .optimization import optimize, optimize_max_damage
from .model import compute_totals
from .config import SKILL_LEVEL_COST, SKILL_NAMES, GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, AMMO_NAMES, FOOD_NAMES, SKILL_POINTS_PER_LEVEL, GEAR
from .utils import get_tier_color, get_consumable_color, format_number, convert_numpy_types
from .build_selector import select_builds, select_builds_near_target
from .api import get_scrap_price, get_case1_price, get_case2_price, get_pill_price, update_gear_prices_from_api, update_food_and_ammo_from_api
from collections import Counter

app = Flask(__name__, template_folder="../templates", static_folder="../static")
gunicorn_logger = logging.getLogger("gunicorn.error")
app.logger.handlers = gunicorn_logger.handlers
app.logger.setLevel(gunicorn_logger.level)

update_gear_prices_from_api()
update_food_and_ammo_from_api()


def _enrich_build(d, pill, scrap_price, case1_price, case2_price):
    """Enrich a build dict with names, quantities, colors, scrap, cases, and formatted numbers."""
    d['ammo_name'] = AMMO_NAMES[d['ammo_idx']]
    d['food_name'] = FOOD_NAMES[d['food_idx']]
    d['ammo_quantity'] = 0 if d['ammo_name'] == 'noAmmo' else int(np.ceil(d['diag']['n_attacks']))
    day_multiplier = 1.8 if pill else 2.4
    d['food_quantity'] = 0 if d['food_name'] == 'noFood' else (int(np.floor(d['diag']['hun'] * day_multiplier)) if pill else int(np.ceil(d['diag']['hun'] * day_multiplier)))

    d['gear'] = []
    for i in range(len(GEAR_SLOTS)):
        slot = GEAR_SLOTS[i]
        tier = WEAPON_TIERS[d['gear_idx'][i]] if i == 0 else GEAR_TIERS[d['gear_idx'][i]]
        image_name = WEAPON_TIERS[d['gear_idx'][i]] if i == 0 else GEAR_SLOTS[i]
        ddg = d['diag']['ddg']
        n_attacks = d['diag']['n_attacks']
        decay_multiplier = 1 if slot == "weapon" else (1 - ddg / (ddg + 40))
        total_decay_percent = float(n_attacks) * decay_multiplier
        quantity = round(total_decay_percent / 100, 2)
        d['gear'].append({
            'tier': tier,
            'image_name': image_name,
            'slot': slot,
            'quantity': max(0.01, quantity),
            'is_none': tier == "none",
        })

    d['ammo_color'] = get_consumable_color(d['ammo_name'])
    d['food_color'] = get_consumable_color(d['food_name'])
    for i in range(len(d['gear'])):
        d['gear'][i]['color'] = get_tier_color(d['gear'][i]['tier'])

    d["total_damage_formatted"] = format_number(d["total_damage"])
    d["total_cost_formatted"] = format_number(d["total_cost"])

    total_scrap_generated = 0
    for i in range(len(GEAR_SLOTS)):
        slot = GEAR_SLOTS[i]
        tier = WEAPON_TIERS[d['gear_idx'][i]] if i == 0 else GEAR_TIERS[d['gear_idx'][i]]
        scrap_value = GEAR[slot][tier]["scrap"]
        quantity = d['gear'][i]['quantity']
        total_scrap_generated += (scrap_value / 3) * quantity
    d["total_scrap_generated"] = total_scrap_generated
    d["monetary_value_from_scrap"] = total_scrap_generated * scrap_price
    d["total_scrap_generated_formatted"] = format_number(d["total_scrap_generated"])
    d["monetary_value_from_scrap_formatted"] = format_number(d["monetary_value_from_scrap"])

    n_attacks = d["diag"]["n_attacks"]
    prc = d["diag"]["prc"]
    loot = 0.02 + 0.02 * d["skill_lvls"][8]
    cases_per_day = loot * n_attacks * prc
    elite_cases_per_day = (loot / 100) * n_attacks * prc
    d["cases_per_day"] = cases_per_day
    d["elite_cases_per_day"] = elite_cases_per_day
    d["case_value"] = cases_per_day * case1_price
    d["elite_case_value"] = elite_cases_per_day * case2_price
    d["case_value_formatted"] = format_number(d["case_value"])
    d["cases_per_day_formatted"] = format_number(cases_per_day)
    d["elite_case_value_formatted"] = format_number(d["elite_case_value"])
    d["elite_cases_per_day_formatted"] = format_number(elite_cases_per_day)
    d["net_cost"] = d["total_cost"] - d["monetary_value_from_scrap"] - d["case_value"] - d["elite_case_value"]
    d["net_cost_formatted"] = format_number(d["net_cost"])

    return d


@app.route("/")
def index():
    return render_template("index.html")

@app.route("/optimize", methods=["POST"])
def run_optimization():
    level = int(request.form.get("level", 1))
    companies = int(request.form.get("companies", 1))
    pill = request.form.get("pill") == "on"
    mode = request.form.get("mode", "optimize")
    objective = request.form.get("objective", "damage")
    rank_bonus = 1 + (float(request.form.get("rank_bonus", 0)) / 100)
    battle_bonus = 1 + (float(request.form.get("battle_bonus", 0)) / 100)
    rank_bonus = rank_bonus * battle_bonus
    # Calculate skill point cost for companies
    company_cost = 0
    if companies > 2:
        n = companies - 2
        company_cost = n * (n + 1) // 2

    # Adjust level based on company cost
    # Safety: Ensure level doesn't go below 1
    adjusted_level = max(1.0, level - (company_cost / SKILL_POINTS_PER_LEVEL))

    # Fetch prices (needed for all modes)
    scrap_price = get_scrap_price()
    case1_price = get_case1_price()
    case2_price = get_case2_price()
    pill_price = get_pill_price() if pill else 0.0
    app.logger.info(f"Scrap price from API: {scrap_price}")

    # --- Max damage mode: dedicated single-objective optimization ---
    if mode == "max_damage":
        md = optimize_max_damage(adjusted_level, rank_bonus=rank_bonus, pill_mode=pill, pill_price=pill_price, case1_price=case1_price)
        if md is None:
            return jsonify(builds=[])
        md["is_highest_damage"] = True
        md = _enrich_build(md, pill, scrap_price, case1_price, case2_price)
        return jsonify(builds=convert_numpy_types([md]))

    res = optimize(adjusted_level, verbose=True, rank_bonus=rank_bonus, pill_mode=pill, pill_price=pill_price, case1_price=case1_price, case2_price=case2_price, objective=objective)
    X = None
    if hasattr(res, "algorithm") and hasattr(res.algorithm, "pop") and len(res.algorithm.pop) > 0:
        try:
            X = res.algorithm.pop.get("X")
        except Exception:
            X = None
    if X is None and hasattr(res, "X"):
        X = res.X

    if X is None:
        return jsonify(builds=[], trends="")

    details = []
    for row in X:
        row = np.round(row).astype(int)
        skill_lvls = row[:9]
        gear_idx   = row[9:15]
        ammo_idx   = int(row[15])
        food_idx   = int(row[16])
        total_damage, total_cost, diag = compute_totals(skill_lvls, gear_idx, ammo_idx, food_idx, rank_bonus=rank_bonus, pill_mode=pill, pill_price=pill_price)
        skill_cost = int(np.sum(SKILL_LEVEL_COST[skill_lvls]))
        details.append({
            "skill_lvls": skill_lvls.tolist(),
            "gear_idx": gear_idx.tolist(),
            "ammo_idx": ammo_idx,
            "food_idx": food_idx,
            "total_damage": total_damage,
            "total_cost": total_cost,
            "skill_cost": skill_cost,
            "diag": diag
        })

    details = sorted(details, key=lambda x: (x["total_cost"], -x["total_damage"]))

    # Pre-compute net_cost for efficient build selection
    for d in details:
        ddg = d['diag']['ddg']
        n_attacks = d['diag']['n_attacks']
        total_scrap = 0
        for i in range(len(GEAR_SLOTS)):
            slot = GEAR_SLOTS[i]
            tier = WEAPON_TIERS[d['gear_idx'][i]] if i == 0 else GEAR_TIERS[d['gear_idx'][i]]
            decay_multiplier = 1 if slot == "weapon" else (1 - ddg / (ddg + 40))
            quantity = round(float(n_attacks) * decay_multiplier / 100, 2)
            total_scrap += (GEAR[slot][tier]["scrap"] / 3) * quantity
        loot_chance = 0.02 + 0.02 * d["skill_lvls"][8]
        prc = d['diag']['prc']
        case_value = loot_chance * n_attacks * prc * case1_price
        elite_case_value = (loot_chance / 100) * n_attacks * prc * case2_price
        d["net_cost"] = d["total_cost"] - (total_scrap * scrap_price) - case_value - elite_case_value

    # --- Always compute the max damage build for use as upper bound ---
    md = optimize_max_damage(adjusted_level, rank_bonus=rank_bonus, pill_mode=pill, pill_price=pill_price)
    if md is not None:
        md['is_highest_damage'] = True
        md = _enrich_build(md, pill, scrap_price, case1_price, case2_price)
        max_damage_value = int(md['total_damage'])
        max_net_cost_value = float(md['net_cost'])
    else:
        max_damage_value = 5000000
        max_net_cost_value = 5000.0

    # Enrich the full Pareto front (details already spans cheap→expensive)
    all_builds_enriched = [_enrich_build(d, pill, scrap_price, case1_price, case2_price) for d in details]

    # --- Build selection: always 19 builds across damage bands 50k→max ---
    pareto_details = select_builds(all_builds_enriched, min_damage=50000, max_damage=max_damage_value, num_builds=19, cost_key="net_cost", metric=objective)
    pareto_details = sorted(pareto_details, key=lambda x: x["total_cost"])
    builds = list(pareto_details)

    if objective == "cases":
        # In cases mode, the "top" build is the best money-maker (lowest net_cost)
        if md is not None:
            md["is_highest_damage"] = False
            builds.append(md)
        if all_builds_enriched:
            best_money = min(all_builds_enriched, key=lambda x: x["net_cost"])
            # Mark it; add to builds if not already present
            if not any(b is best_money for b in builds):
                builds.append(best_money)
            for b in builds:
                if b is best_money:
                    b["is_highest_damage"] = True
                    break
    else:
        if md is not None:
            builds.append(md)

    return jsonify(
        builds=convert_numpy_types(builds),
        all_builds=convert_numpy_types(all_builds_enriched),
        max_damage_value=max_damage_value,
        max_net_cost_value=max_net_cost_value
    )

if __name__ == "__main__":
    app.run(debug=True)
