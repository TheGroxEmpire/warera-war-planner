from flask import Flask, render_template, request, jsonify
import numpy as np
import requests
import os
from .api import update_gear_prices_from_api, update_food_and_ammo_from_api
from .optimization import optimize
from .model import compute_totals
from .config import SKILL_LEVEL_COST, SKILL_NAMES, GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, AMMO_NAMES, FOOD_NAMES, SKILL_POINTS_PER_LEVEL
from collections import Counter

app = Flask(__name__, template_folder="../templates", static_folder="../static")

DISINFO_COUNTRIES = ["VE", "RO", "ES", "FR"]

def get_country_from_ip(ip_address):
    if not ip_address or ip_address == "127.0.0.1":
        return "US" # Default to US for local testing
    try:
        response = requests.get(f"http://ip-api.com/json/{ip_address}")
        data = response.json()
        return data.get("countryCode")
    except Exception:
        return None

def generate_disinformation_builds(details, level, companies, pill, dodge_build):
    # Sort by total damage in ascending order
    details = sorted(details, key=lambda x: x["total_damage"])
    
    # Select builds in 50k damage increments from the bottom
    disinfo_builds = []
    next_damage_threshold = 50000
    for d in details:
        if d["total_damage"] >= next_damage_threshold:
            disinfo_builds.append(d)
            next_damage_threshold += 50000
            
    pill_text = "Using pill" if pill else "Not using pill"
    dodge_text = "focusing dodge" if dodge_build else "not focusing dodge"
    
    builds_html = f"<h3>Optimized builds for level {level} with {companies} companies. {pill_text} and {dodge_text}.</h3>"
    
    for d in disinfo_builds:
        builds_html += "<div class='card'>"
        builds_html += f"<b>Total Damage:</b> {d['total_damage']:.2f}<br>"
        builds_html += f"<b>Expected number of attacks:</b> {d['diag']['n_attacks']:.2f}<br>"
        builds_html += f"<b>Total gear cost:</b> {d['diag']['gear_cost']:.2f}<br>"
        builds_html += f"<b>Daily consumables (ammo+food) cost:</b> {d['diag']['food_cost'] + d['diag']['ammo_bullet_cost']:.2f}<br>"
        builds_html += "<table>"
        for i in range(0, len(SKILL_NAMES), 2):
            builds_html += "<tr>"
            builds_html += f"<td>{SKILL_NAMES[i]}: {d['skill_lvls'][i]}</td>"
            if i + 1 < len(SKILL_NAMES):
                builds_html += f"<td>{SKILL_NAMES[i+1]}: {d['skill_lvls'][i+1]}</td>"
            builds_html += "</tr>"
        builds_html += "</table>"
        builds_html += "<table>"
        for i in range(0, len(GEAR_SLOTS), 2):
            builds_html += "<tr>"
            slot1 = GEAR_SLOTS[i]
            tier1 = WEAPON_TIERS[d['gear_idx'][i]] if i == 0 else GEAR_TIERS[d['gear_idx'][i]]
            builds_html += f"<td>{slot1}: {tier1}</td>"
            if i + 1 < len(GEAR_SLOTS):
                slot2 = GEAR_SLOTS[i+1]
                tier2 = GEAR_TIERS[d['gear_idx'][i+1]]
                builds_html += f"<td>{slot2}: {tier2}</td>"
            builds_html += "</tr>"
        builds_html += "<tr>"
        builds_html += f"<td>Ammo: {AMMO_NAMES[d['ammo_idx']]}</td>"
        builds_html += f"<td>Food: {FOOD_NAMES[d['food_idx']]}</td>"
        builds_html += "</tr>"
        builds_html += "</table>"
        builds_html += "</div>"
        
    return jsonify(builds=builds_html, trends="")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/optimize", methods=["POST"])
def run_optimization():
    user_ip = request.remote_addr
    country = get_country_from_ip(user_ip)

    level = int(request.form.get("level", 1))
    companies = int(request.form.get("companies", 1))
    pill = request.form.get("pill") == "on"
    dodge_build = request.form.get("dodge") == "on"
    
    dev_mode_disinfo = os.environ.get("DEV_MODE_DISINFO") == "true"
    
    # Calculate skill point cost for companies
    company_cost = 0
    if companies > 2:
        n = companies - 2
        company_cost = n * (n + 1) // 2
        
    # Adjust level based on company cost
    adjusted_level = level - (company_cost / SKILL_POINTS_PER_LEVEL)

    res = optimize(adjusted_level, dodge_build=dodge_build, verbose=True)
    X = None
    if hasattr(res, "algorithm") and hasattr(res.algorithm, "pop") and len(res.algorithm.pop) > 0:
        try:
            X = res.algorithm.pop.get("X")
        except Exception:
            X = None
    if X is None and hasattr(res, "X"):
        X = res.X
    
    if X is None:
        return jsonify(builds="<p>No optimal builds found.</p>", trends="")
        
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
            "skill_lvls": skill_lvls,
            "gear_idx": gear_idx,
            "ammo_idx": ammo_idx,
            "food_idx": food_idx,
            "total_damage": total_damage,
            "total_cost": total_cost,
            "skill_cost": skill_cost,
            "diag": diag
        })

    details = [d for d in details if d["total_damage"] <= 1000000]
    
    if dev_mode_disinfo or country in DISINFO_COUNTRIES:
        return generate_disinformation_builds(details, level, companies, pill, dodge_build)

    details = sorted(details, key=lambda x: (x["total_cost"], -x["total_damage"]))
    pareto = []
    max_damage = -1
    for d in details:
        if d["total_damage"] > max_damage:
            pareto.append(d)
            max_damage = d["total_damage"]
            
    # --- Trends Analysis ---
    high_damage_builds = [d for d in details if d["total_damage"] >= 50000]
    trends_html = ""
    if high_damage_builds:
        skill_builds = [tuple(d["skill_lvls"]) for d in high_damage_builds]
        build_counts = Counter(skill_builds)
        top_3_builds = build_counts.most_common(3)
        total_high_damage_builds = len(high_damage_builds)

        trends_html += "<h3>Trends</h3>"
        trend_titles = ["Most common build", "Second most common", "Third most common"]
        for i, (build, count) in enumerate(top_3_builds):
            percentage = (count / total_high_damage_builds) * 100
            trends_html += f"<div class='trend-card'>"
            trends_html += f"<h4>{trend_titles[i]} ({percentage:.2f}%)</h4>"
            trends_html += "<table>"
            for j in range(0, len(SKILL_NAMES), 2):
                trends_html += "<tr>"
                trends_html += f"<td>{SKILL_NAMES[j]}: {build[j]}</td>"
                if j + 1 < len(SKILL_NAMES):
                    trends_html += f"<td>{SKILL_NAMES[j+1]}: {build[j+1]}</td>"
                trends_html += "</tr>"
            trends_html += "</table>"
            trends_html += "</div>"

    # --- Results Display ---
    pill_text = "Using pill" if pill else "Not using pill"
    dodge_text = "focusing dodge" if dodge_build else "not focusing dodge"
    builds_html = f"<h3>Optimized builds for level {level} with {companies} companies. {pill_text} and {dodge_text}.</h3>"
    
    # Select builds in 50k damage increments
    filtered_pareto = []
    next_damage_threshold = 50000
    for d in pareto:
        if d["total_damage"] >= next_damage_threshold:
            filtered_pareto.append(d)
            next_damage_threshold += 50000
    
    if not filtered_pareto and pareto:
        filtered_pareto.append(pareto[-1]) # at least show the best one

    for d in filtered_pareto:
        builds_html += "<div class='card'>"
        builds_html += f"<b>Total Damage:</b> {d['total_damage']:.2f}<br>"
        builds_html += f"<b>Expected number of attacks:</b> {d['diag']['n_attacks']:.2f}<br>"
        builds_html += f"<b>Total gear cost:</b> {d['diag']['gear_cost']:.2f}<br>"
        builds_html += f"<b>Daily consumables (ammo+food) cost:</b> {d['diag']['food_cost'] + d['diag']['ammo_bullet_cost']:.2f}<br>"

        # Skills table
        builds_html += "<table>"
        for i in range(0, len(SKILL_NAMES), 2):
            builds_html += "<tr>"
            builds_html += f"<td>{SKILL_NAMES[i]}: {d['skill_lvls'][i]}</td>"
            if i + 1 < len(SKILL_NAMES):
                builds_html += f"<td>{SKILL_NAMES[i+1]}: {d['skill_lvls'][i+1]}</td>"
            builds_html += "</tr>"
        builds_html += "</table>"
        
        # Gear table
        builds_html += "<table>"
        for i in range(0, len(GEAR_SLOTS), 2):
            builds_html += "<tr>"
            slot1 = GEAR_SLOTS[i]
            tier1 = WEAPON_TIERS[d['gear_idx'][i]] if i == 0 else GEAR_TIERS[d['gear_idx'][i]]
            builds_html += f"<td>{slot1}: {tier1}</td>"
            if i + 1 < len(GEAR_SLOTS):
                slot2 = GEAR_SLOTS[i+1]
                tier2 = GEAR_TIERS[d['gear_idx'][i+1]]
                builds_html += f"<td>{slot2}: {tier2}</td>"
            builds_html += "</tr>"
        builds_html += "<tr>"
        builds_html += f"<td>Ammo: {AMMO_NAMES[d['ammo_idx']]}</td>"
        builds_html += f"<td>Food: {FOOD_NAMES[d['food_idx']]}</td>"
        builds_html += "</tr>"
        builds_html += "</table>"

        builds_html += "</div>"

    return jsonify(builds=builds_html, trends=trends_html)

if __name__ == "__main__":
    app.run(debug=True)
