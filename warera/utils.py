import os
import csv
import numpy as np
import pandas as pd
from collections import Counter
from .config import GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, AMMO_NAMES, FOOD_NAMES, MAX_SKILL_LEVEL, SKILL_POINTS_PER_LEVEL, SKILL_LEVEL_COST
import requests
import json
import logging

gunicorn_logger = logging.getLogger("gunicorn.error")

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

def format_number(num):
    if num >= 1000000:
        return f"{num/1000000:.2f}M"
    if num > 1000:
        return f"{num/1000:.1f}K"
    return f"{num:.2f}"

def get_country_from_ip(ip_address):
    gunicorn_logger.info(f"get_country_from_ip called with IP: {ip_address}")
    if os.environ.get("DEV_MODE_DISINFO_COUNTRY"):
        return os.environ.get("DEV_MODE_DISINFO_COUNTRY")
    if not ip_address or ip_address == "127.0.0.1":
        gunicorn_logger.info("IP is local, returning US")
        return "US"  # Default to US for local testing
    try:
        response = requests.get(f"http://ip-api.com/json/{ip_address}")
        data = response.json()
        country_code = data.get("countryCode")
        gunicorn_logger.info(f"API response: {data}")
        gunicorn_logger.info(f"Detected country code: {country_code} for IP: {ip_address}")
        return country_code
    except Exception as e:
        gunicorn_logger.error(f"An error occurred: {e}")
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

def closest_feasible_build(avg_vector, level):
    """Find the closest feasible skill build to the averages (respecting total skill-point budget)."""
    budget = int(level * SKILL_POINTS_PER_LEVEL)
    candidate = np.rint(avg_vector).astype(int)
    candidate = np.clip(candidate, 0, MAX_SKILL_LEVEL)

    def cost(skill_lvls):
        return np.sum(SKILL_LEVEL_COST[skill_lvls])

    # If already within budget, return
    if cost(candidate) <= budget:
        return candidate

    # Otherwise reduce values that are furthest above the fractional average first
    frac = np.rint(avg_vector)
    while cost(candidate) > budget:
        # choose index with largest (candidate - frac)
        diffs = candidate - frac
        idx = int(np.argmax(diffs))
        if candidate[idx] > 0:
            candidate[idx] -= 1
        else:
            # nothing to reduce; break (shouldn't happen)
            break

    # If there's room to increase toward rounded averages, do that
    while cost(candidate) + 1 <= budget:
        diffs_up = frac - candidate
        idx_up = int(np.argmax(diffs_up))
        if diffs_up[idx_up] > 0 and candidate[idx_up] < MAX_SKILL_LEVEL:
            candidate[idx_up] += 1
        else:
            break

    return candidate

def write_csv_header(outfile):
    header = [
        "level",
        *[f"{slot}_tier" for slot in GEAR_SLOTS],
        "ammo", "food",
        "atk_lvl", "prc_lvl", "critc_lvl", "critd_lvl", "arm_lvl", "ddg_lvl", "hp_lvl", "hun_lvl",
        "total_damage", "total_cost", "damage_per_cost", "n_attacks", "dmg_per_attack",
        "skill_points_cost", "gear_cost", "food_cost", "bullet_cost_per_attack",
        "atk","prc","critc","critd","arm","ddg","hp","hun",
    ]
    # if not os.path.exists(outfile):
    with open(outfile, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)

def save_results_details(details, level, outfile="builds_cost_damage.csv"):
    """Append details list to CSV. details contains tuples produced in main."""
    with open(outfile, "a", newline="") as f:
        writer = csv.writer(f)
        for (skill_lvls, gear_idx, ammo_idx, food_idx, total_damage, total_cost, skill_cost, diag) in details:
            gear_tiers = []
            for i, slot in enumerate(GEAR_SLOTS):
                idx = int(gear_idx[i])
                if slot == "weapon":
                    gear_tiers.append(WEAPON_TIERS[idx])
                else:
                    gear_tiers.append(GEAR_TIERS[idx])

            ammo_name = AMMO_NAMES[int(ammo_idx)]
            food_name = FOOD_NAMES[int(food_idx)]
            row = [
                level,
                *gear_tiers,
                ammo_name, food_name,
                *[int(x) for x in skill_lvls.tolist()],
                float(total_damage),
                float(total_cost),
                float(total_damage / total_cost) if total_cost > 0 else np.nan,
                float(diag["n_attacks"]),
                float(diag["dmg_per_attack"]),
                int(skill_cost),
                float(diag["gear_cost"]),
                float(diag["food_cost"]),
                float(diag["ammo_bullet_cost"]),
                float(diag["atk"]), float(diag["prc"]), float(diag["critc"]), float(diag["critd"]),
                float(diag["arm"]), float(diag["ddg"]), float(diag["hp"]), float(diag["hun"]),
            ]
            writer.writerow(row)
