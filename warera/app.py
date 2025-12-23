from flask import Flask, render_template, request, jsonify
import numpy as np
import os
import logging
from .optimization import optimize
from .model import compute_totals
from .config import SKILL_LEVEL_COST, SKILL_NAMES, GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, AMMO_NAMES, FOOD_NAMES, SKILL_POINTS_PER_LEVEL
from .utils import get_tier_color, get_consumable_color, format_number, get_country_from_ip, convert_numpy_types
from .build_selector import select_builds
from collections import Counter

app = Flask(__name__, template_folder="../templates", static_folder="../static")
gunicorn_logger = logging.getLogger("gunicorn.error")
app.logger.handlers = gunicorn_logger.handlers
app.logger.setLevel(gunicorn_logger.level)

DISINFO_COUNTRIES = ["VE", "RO", "ES", "FR", "PT"]

def generate_trends_html(details):
    high_damage_builds = [d for d in details if d["total_damage"] < 1000000]
    trends_html = ""
    if high_damage_builds:
        skill_builds = [tuple(d["skill_lvls"]) for d in high_damage_builds]
        build_counts = Counter(skill_builds)
        top_3_builds = build_counts.most_common(3)
        total_high_damage_builds = len(high_damage_builds)

        trend_titles = ["Most common build", "Second most common", "Third most common"]
        for i, (build, count) in enumerate(top_3_builds):
            percentage = (count / total_high_damage_builds) * 100
            trends_html += f"<div class='trend-card'>"
            trends_html += f"<h3>{trend_titles[i]} ({percentage:.2f}%)</h3>"
            trends_html += "<div class='trends-grid'>"
            for j, level in enumerate(build):
                trends_html += f"<div class='skill'><svg><use xlink:href='#skill-svg-{j+1}'></use></svg>{level}<span class='skill-name'>{SKILL_NAMES[j]}</span></div>"
            trends_html += "</div>"
            trends_html += "</div>"
    return trends_html

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/optimize", methods=["POST"])
def run_optimization():
    if "X-Forwarded-For" in request.headers:
        user_ip = request.headers["X-Forwarded-For"].split(",")[0].strip()
        app.logger.info(f"X-Forwarded-For: {request.headers['X-Forwarded-For']}")
    else:
        user_ip = request.remote_addr
    app.logger.info(f"User IP address: {user_ip}")
    country = get_country_from_ip(user_ip)
    app.logger.info(f"Country detected: {country}")

    level = int(request.form.get("level", 1))
    companies = int(request.form.get("companies", 1))
    pill = request.form.get("pill") == "on"
    rank_bonus = 1 + (float(request.form.get("rank_bonus")) / 100)
    
    dev_mode_disinfo = os.environ.get("DEV_MODE_DISINFO") == "true"
    disinformation_mode = dev_mode_disinfo or country in DISINFO_COUNTRIES
    
    # Calculate skill point cost for companies
    company_cost = 0
    if companies > 2:
        n = companies - 2
        company_cost = n * (n + 1) // 2
        
    # Adjust level based on company cost
    # Safety: Ensure level doesn't go below 1
    adjusted_level = max(1.0, level - (company_cost / SKILL_POINTS_PER_LEVEL))

    res = optimize(adjusted_level, verbose=True, disinformation_mode=disinformation_mode, rank_bonus=rank_bonus, pill_mode=pill)
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
        total_damage, total_cost, diag = compute_totals(skill_lvls, gear_idx, ammo_idx, food_idx, rank_bonus=rank_bonus, pill_mode=pill)
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
    
    trends_html = generate_trends_html(details)
            
    # --- New cost band filtering logic ---
    pareto_details = select_builds(details)
    pareto_details = sorted(pareto_details, key=lambda x: x["total_cost"])

    builds = []
    for d in pareto_details:
        # Add consumable and gear names
        d['ammo_name'] = AMMO_NAMES[d['ammo_idx']]
        d['food_name'] = FOOD_NAMES[d['food_idx']]
        d['ammo_quantity'] = int(np.ceil(d['diag']['n_attacks']))
        d['food_quantity'] = int(np.ceil(d['diag']['hun'] * 2.4))

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
            decay_multiplier = 1 if slot == "weapon" else (1 - ddg)
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

    return jsonify(builds=convert_numpy_types(builds), trends=trends_html)

if __name__ == "__main__":
    app.run(debug=True)
