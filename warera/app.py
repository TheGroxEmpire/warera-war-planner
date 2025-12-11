from flask import Flask, render_template, request, jsonify
import numpy as np
import requests
import os
import logging
from .api import update_gear_prices_from_api, update_food_and_ammo_from_api
from .optimization import optimize
from .model import compute_totals
from .config import SKILL_LEVEL_COST, SKILL_NAMES, GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, AMMO_NAMES, FOOD_NAMES, SKILL_POINTS_PER_LEVEL
from collections import Counter

app = Flask(__name__, template_folder="../templates", static_folder="../static")
gunicorn_logger = logging.getLogger("gunicorn.error")
app.logger.handlers = gunicorn_logger.handlers
app.logger.setLevel(gunicorn_logger.level)

def format_number(num):
    if num >= 1000000:
        return f"{num/1000000:.2f}M"
    if num > 1000:
        return f"{num/1000:.1f}K"
    return f"{num:.2f}"

def get_tier_color(tier):
    colors = {
        "grey": "rgb(58, 71, 83)", "green": "rgb(33, 88, 53)", "blue": "rgb(27, 54, 114)", "purple": "rgb(68, 46, 102)", "gold": "rgb(86, 83, 40)", "red": "rgb(103, 31, 31)",
        "knife": "rgb(58, 71, 83)", "gun": "rgb(33, 88, 53)", "rifle": "rgb(27, 54, 114)", "sniper": "rgb(68, 46, 102)", "tank": "rgb(86, 83, 40)", "jet": "rgb(103, 31, 31)"
    }
    return colors.get(tier.lower(), "white")

def get_consumable_color(name):
    if "light" in name.lower() or "bread" in name.lower():
        return "rgb(33, 88, 53)"
    if "heavy" in name.lower() or "fish" in name.lower():
        return "rgb(68, 46, 102)"
    if "ammo" in name.lower() or "steak" in name.lower():
        return "rgb(27, 54, 114)"
    return "white"

DISINFO_COUNTRIES = ["VE", "RO", "ES", "FR"]

def get_country_from_ip(ip_address):
    app.logger.info(f"get_country_from_ip called with IP: {ip_address}")
    if os.environ.get("DEV_MODE_DISINFO_COUNTRY"):
        return os.environ.get("DEV_MODE_DISINFO_COUNTRY")
    if not ip_address or ip_address == "127.0.0.1":
        app.logger.info("IP is local, returning US")
        return "US"  # Default to US for local testing
    try:
        response = requests.get(f"http://ip-api.com/json/{ip_address}")
        data = response.json()
        country_code = data.get("countryCode")
        app.logger.info(f"API response: {data}")
        app.logger.info(f"Detected country code: {country_code} for IP: {ip_address}")
        return country_code
    except Exception as e:
        app.logger.error(f"An error occurred: {e}")
        return None

def convert_numpy_types(obj):
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {k: convert_numpy_types(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(i) for i in obj]
    else:
        return obj

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
    dodge_build = request.form.get("dodge") == "on"
    
    dev_mode_disinfo = os.environ.get("DEV_MODE_DISINFO") == "true"
    disinformation_mode = dev_mode_disinfo or country in DISINFO_COUNTRIES
    
    # Calculate skill point cost for companies
    company_cost = 0
    if companies > 2:
        n = companies - 2
        company_cost = n * (n + 1) // 2
        
    # Adjust level based on company cost
    adjusted_level = level - (company_cost / SKILL_POINTS_PER_LEVEL)

    res = optimize(adjusted_level, dodge_build=dodge_build, verbose=True, disinformation_mode=disinformation_mode)
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
        total_damage, total_cost, diag = compute_totals(skill_lvls, gear_idx, ammo_idx, food_idx)
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
    
    # --- Trends Analysis ---
    high_damage_builds = [d for d in details if d["total_damage"] >= 50000]
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
            
    # --- New cost band filtering logic ---
    damage_bands = [
        (50000, 1000), (75000, 1000), (100000, 1000), (150000, 1000), 
        (200000, 5000), (250000, 5000), (300000, 5000), (400000, 5000),
        (500000, 10000), (750000, 10000), (1000000, 100000), (2000000, 100000)
    ]
    
    best_builds_by_band = {}

    for d in details:
        for center, tolerance in damage_bands:
            if (center - tolerance) <= d["total_damage"] <= (center + tolerance):
                band_key = center
                # Check if the cost is greater than zero to avoid division by zero
                if d["total_cost"] > 0:
                    efficiency = d["total_damage"] / d["total_cost"]
                    if band_key not in best_builds_by_band or efficiency > best_builds_by_band[band_key].get("efficiency", 0):
                        d["efficiency"] = efficiency
                        best_builds_by_band[band_key] = d

    pareto_details = list(best_builds_by_band.values())
    pareto_details = sorted(pareto_details, key=lambda x: x["total_cost"])

    builds = []
    for d in pareto_details:
        # Add consumable and gear names
        d['ammo_name'] = AMMO_NAMES[d['ammo_idx']]
        d['food_name'] = FOOD_NAMES[d['food_idx']]
        d['gear'] = []
        for i in range(len(GEAR_SLOTS)):
            tier = WEAPON_TIERS[d['gear_idx'][i]] if i == 0 else GEAR_TIERS[d['gear_idx'][i]]
            image_name = WEAPON_TIERS[d['gear_idx'][i]] if i == 0 else GEAR_SLOTS[i]
            d['gear'].append({
                'tier': tier,
                'image_name': image_name,
                'slot': GEAR_SLOTS[i]
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
