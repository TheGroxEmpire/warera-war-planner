from flask import Flask, render_template, request, jsonify
import numpy as np
import os
import logging
from .optimization import optimize, optimize_max_damage
from .model import compute_totals
from .config import SKILL_LEVEL_COST, SKILL_NAMES, GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, AMMO_NAMES, FOOD_NAMES, SKILL_POINTS_PER_LEVEL, GEAR
from .utils import get_tier_color, get_consumable_color, format_number, convert_numpy_types
from .build_selector import select_builds
from .api import get_scrap_price, update_gear_prices_from_api, update_food_and_ammo_from_api
from collections import Counter

app = Flask(__name__, template_folder="../templates", static_folder="../static")
gunicorn_logger = logging.getLogger("gunicorn.error")
app.logger.handlers = gunicorn_logger.handlers
app.logger.setLevel(gunicorn_logger.level)

update_gear_prices_from_api()
update_food_and_ammo_from_api()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/optimize", methods=["POST"])
def run_optimization():
    level = int(request.form.get("level", 1))
    companies = int(request.form.get("companies", 1))
    pill = request.form.get("pill") == "on"
    include_max_damage = request.form.get("max_damage_build") == "on"
    rank_bonus = 1 + (float(request.form.get("rank_bonus")) / 100)
    scaling_mode = request.form.get("scaling_mode", "dev")
    
    # Calculate skill point cost for companies
    company_cost = 0
    if companies > 2:
        n = companies - 2
        company_cost = n * (n + 1) // 2
        
    # Adjust level based on company cost
    # Safety: Ensure level doesn't go below 1
    adjusted_level = max(1.0, level - (company_cost / SKILL_POINTS_PER_LEVEL))

    res = optimize(adjusted_level, verbose=True, rank_bonus=rank_bonus, pill_mode=pill, scaling_mode=scaling_mode)
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
        total_damage, total_cost, diag = compute_totals(skill_lvls, gear_idx, ammo_idx, food_idx, rank_bonus=rank_bonus, pill_mode=pill, scaling_mode=scaling_mode)
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
    
    # --- New cost band filtering logic ---
    pareto_details = select_builds(details)
    pareto_details = sorted(pareto_details, key=lambda x: x["total_cost"])

    builds = []
    for d in pareto_details:
        # Add consumable and gear names
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
            
            # Calculate quantity based on durability (decay)
            # Each use is 1% durability (or less if dodge applies)
            # Total decay = 1% * n_attacks * (1 - ddg) [for non-weapons]
            ddg = d['diag']['ddg']
            n_attacks = d['diag']['n_attacks']
            if scaling_mode == 'dev':
                decay_multiplier = 1 if slot == "weapon" else (1 - ddg / (ddg + 40))
            else:
                decay_multiplier = 1 if slot == "weapon" else (1 - ddg / 100)
            total_decay_percent = n_attacks * decay_multiplier
            quantity = int(np.ceil(total_decay_percent / 100))

            d['gear'].append({
                'tier': tier,
                'image_name': image_name,
                'slot': slot,
                'quantity': max(1, quantity)
            })

        # Add colors
        d['ammo_color'] = get_consumable_color(d['ammo_name'])
        d['food_color'] = get_consumable_color(d['food_name'])
        for i in range(len(d['gear'])):
            d['gear'][i]['color'] = get_tier_color(d['gear'][i]['tier'])
        
        d["total_damage_formatted"] = format_number(d["total_damage"])
        d["total_cost_formatted"] = format_number(d["total_cost"])
        builds.append(d)

    # Calculate scrap values
    scrap_price = get_scrap_price()
    app.logger.info(f"Scrap price from API: {scrap_price}")
    
    for d in builds:
        total_scrap_generated = 0
        # For each gear piece, scrap generated = (scrap_value / 3) * quantity
        # where quantity represents how many times the item is used (every 100 durability)
        for i in range(len(GEAR_SLOTS)):
            slot = GEAR_SLOTS[i]
            tier = WEAPON_TIERS[d['gear_idx'][i]] if i == 0 else GEAR_TIERS[d['gear_idx'][i]]
            scrap_value = GEAR[slot][tier]["scrap"]
            quantity = d['gear'][i]['quantity']
            # Each item used (100 durability) generates scrap_value/3
            total_scrap_generated += (scrap_value / 3) * quantity
        
        d["total_scrap_generated"] = total_scrap_generated
        d["monetary_value_from_scrap"] = total_scrap_generated * scrap_price
        d["total_scrap_generated_formatted"] = format_number(d["total_scrap_generated"])
        d["monetary_value_from_scrap_formatted"] = format_number(d["monetary_value_from_scrap"])

    if include_max_damage:
        md = optimize_max_damage(adjusted_level, rank_bonus=rank_bonus, pill_mode=pill, scaling_mode=scaling_mode)
        if md is not None:
            d = md
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
                total_decay_percent = n_attacks * decay_multiplier
                quantity = int(np.ceil(total_decay_percent / 100))
                d['gear'].append({
                    'tier': tier,
                    'image_name': image_name,
                    'slot': slot,
                    'quantity': max(1, quantity)
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

            builds.append(d)

    return jsonify(builds=convert_numpy_types(builds))

if __name__ == "__main__":
    app.run(debug=True)
