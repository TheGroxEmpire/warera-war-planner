import os
import csv
import numpy as np
import pandas as pd
from collections import Counter
from .config import GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, AMMO_NAMES, FOOD_NAMES, MAX_SKILL_LEVEL, SKILL_POINTS_PER_LEVEL, SKILL_LEVEL_COST

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
