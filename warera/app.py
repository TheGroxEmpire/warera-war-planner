from flask import Flask, render_template, request, jsonify
import numpy as np
import os
import logging
from .optimization import optimize, optimize_max_damage
from .model import compute_totals
from .config import SKILL_LEVEL_COST, SKILL_NAMES, GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, AMMO_NAMES, FOOD_NAMES, SKILL_POINTS_PER_LEVEL, GEAR
from .utils import get_tier_color, get_consumable_color, format_number, convert_numpy_types
from .build_selector import select_builds, select_builds_near_target
from .api import get_scrap_price, get_case1_price, update_gear_prices_from_api, update_food_and_ammo_from_api
from collections import Counter

app = Flask(__name__, template_folder="../templates", static_folder="../static")
gunicorn_logger = logging.getLogger("gunicorn.error")
app.logger.handlers = gunicorn_logger.handlers
app.logger.setLevel(gunicorn_logger.level)

update_gear_prices_from_api()
update_food_and_ammo_from_api()


def _enrich_build(d, pill, scaling_mode, scrap_price, case1_price):
    """Enrich a build dict with names, quantities, colors, scrap, cases, and formatted numbers."""
    d['ammo_name'] = AMMO_NAMES[d['ammo_idx']]
    d['food_name'] = FOOD_NAMES[d['food_idx']]
    d['ammo_quantity'] = int(np.ceil(d['diag']['n_attacks']))
    day_multiplier = 1.7 if pill else 2.4
    d['food_quantity'] = int(np.ceil(d['diag']['hun'] * day_multiplier))

    d['gear'] = []
    for i in range(len(GEAR_SLOTS)):
        slot = GEAR_SLOTS[i]
        tier = WEAPON_TIERS[d['gear_idx'][i]] if i == 0 else GEAR_TIERS[d['gear_idx'][i]]
        image_name = WEAPON_TIERS[d['gear_idx'][i]] if i == 0 else GEAR_SLOTS[i]
        ddg = d['diag']['ddg']
        n_attacks = d['diag']['n_attacks']
        if scaling_mode == 'dev':
            decay_multiplier = 1 if slot == "weapon" else (1 - ddg / (ddg + 40))
        else:
            decay_multiplier = 1 if slot == "weapon" else (1 - ddg / 100)
        total_decay_percent = float(n_attacks) * decay_multiplier
        quantity = round(total_decay_percent / 100, 2)
        d['gear'].append({
            'tier': tier,
            'image_name': image_name,
            'slot': slot,
            'quantity': max(0.01, quantity)
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

    dmg_per_attack = d["diag"]["dmg_per_attack"]
    n_attacks = d["diag"]["n_attacks"]
    loot_chance_per_hit = 0.05 + 0.05 * (dmg_per_attack / 1000.0)
    cases_per_day = loot_chance_per_hit * n_attacks
    d["cases_per_day"] = cases_per_day
    d["case_value"] = cases_per_day * case1_price
    d["case_value_formatted"] = format_number(d["case_value"])
    d["cases_per_day_formatted"] = format_number(cases_per_day)
    d["net_cost"] = d["total_cost"] - d["monetary_value_from_scrap"] - d["case_value"]
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
    rank_bonus = 1 + (float(request.form.get("rank_bonus", 0)) / 100)
    battle_bonus = 1 + (float(request.form.get("battle_bonus", 0)) / 100)
    rank_bonus = rank_bonus * battle_bonus
    scaling_mode = request.form.get("scaling_mode", "prod")
    health_scaling = request.form.get("health_scaling", "prod")
    arm_step = int(request.form.get("arm_step", 6))
    ddg_step = int(request.form.get("ddg_step", 5))
    hp_step = int(request.form.get("hp_step", 15))
    food_step = int(request.form.get("food_step", 10))

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
    app.logger.info(f"Scrap price from API: {scrap_price}")

    # --- Max damage mode: dedicated single-objective optimization ---
    if mode == "max_damage":
        md = optimize_max_damage(adjusted_level, rank_bonus=rank_bonus, pill_mode=pill, scaling_mode=scaling_mode, health_scaling=health_scaling, arm_step=arm_step, ddg_step=ddg_step, hp_step=hp_step, food_step=food_step)
        if md is None:
            return jsonify(builds=[])
        md["is_highest_damage"] = True
        md = _enrich_build(md, pill, scaling_mode, scrap_price, case1_price)
        return jsonify(builds=convert_numpy_types([md]))

    res = optimize(adjusted_level, verbose=True, rank_bonus=rank_bonus, pill_mode=pill, scaling_mode=scaling_mode, health_scaling=health_scaling, arm_step=arm_step, ddg_step=ddg_step, hp_step=hp_step, food_step=food_step)
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
        skill_lvls = row[:8]
        gear_idx   = row[8:14]
        ammo_idx   = int(row[14])
        food_idx   = int(row[15])
        total_damage, total_cost, diag = compute_totals(skill_lvls, gear_idx, ammo_idx, food_idx, rank_bonus=rank_bonus, pill_mode=pill, scaling_mode=scaling_mode, health_scaling=health_scaling, arm_step=arm_step, ddg_step=ddg_step, hp_step=hp_step, food_step=food_step)
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
            decay_multiplier = 1 if slot == "weapon" else (
                (1 - ddg / (ddg + 40)) if scaling_mode == 'dev' else (1 - ddg / 100)
            )
            quantity = round(float(n_attacks) * decay_multiplier / 100, 2)
            total_scrap += (GEAR[slot][tier]["scrap"] / 3) * quantity
        loot_chance = 0.05 + 0.05 * (d["diag"]["dmg_per_attack"] / 1000.0)
        case_value = loot_chance * n_attacks * case1_price
        d["net_cost"] = d["total_cost"] - (total_scrap * scrap_price) - case_value

    # --- Build selection: targeted or auto ---
    filter_type = request.form.get("filter_type", "none")
    filter_value_raw = request.form.get("filter_value", "")

    if filter_type != "none" and filter_value_raw:
        try:
            filter_value = float(filter_value_raw)
            pareto_details = select_builds_near_target(details, filter_value, filter_type, num_builds=5)
        except ValueError:
            pareto_details = select_builds(details, cost_key="net_cost")
    else:
        pareto_details = select_builds(details, cost_key="net_cost")
    pareto_details = sorted(pareto_details, key=lambda x: x["total_cost"])

    builds = [_enrich_build(d, pill, scaling_mode, scrap_price, case1_price) for d in pareto_details]

    # --- Auto mode: always append mythic set build ---
    if filter_type == "none":
        md = optimize_max_damage(adjusted_level, rank_bonus=rank_bonus, pill_mode=pill, scaling_mode=scaling_mode, health_scaling=health_scaling, arm_step=arm_step, ddg_step=ddg_step, hp_step=hp_step, food_step=food_step)
        if md is not None:
            md = _enrich_build(md, pill, scaling_mode, scrap_price, case1_price)
            builds.append(md)

    return jsonify(builds=convert_numpy_types(builds))

if __name__ == "__main__":
    app.run(debug=True)
