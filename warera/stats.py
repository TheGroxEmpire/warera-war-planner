import numpy as np
from .config import MAX_SKILL_LEVEL, GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, GEAR, BASELINE

# =========================================
# STAT TABLES (skill progression curves)
# =========================================

def make_skill_tables(baseline):
    """Return per-skill arrays of stat values for levels 0..MAX_SKILL_LEVEL."""
    attack = np.array([baseline["atk"] + 20 * lvl for lvl in range(MAX_SKILL_LEVEL + 1)])
    precision = np.array([min(1.0, baseline["prc"]/100 + 0.05 * lvl) for lvl in range(MAX_SKILL_LEVEL + 1)])
    critc = np.array([min(1.0, baseline["critc"]/100 + 0.05 * lvl) for lvl in range(MAX_SKILL_LEVEL + 1)])
    critd = np.array([max(1.0, baseline["critd"]/100 + 0.20 * lvl) for lvl in range(MAX_SKILL_LEVEL + 1)])
    armor = np.array([min(0.9, baseline["arm"]/100 + 0.04 * lvl) for lvl in range(MAX_SKILL_LEVEL + 1)])
    dodge = np.array([min(1.0, baseline["ddg"]/100 + 0.04 * lvl) for lvl in range(MAX_SKILL_LEVEL + 1)])
    health = np.array([baseline["hp"] + 10 * lvl for lvl in range(MAX_SKILL_LEVEL + 1)])
    hunger = np.array([baseline["hun"] + 1 * lvl for lvl in range(MAX_SKILL_LEVEL + 1)])
    return attack, precision, critc, critd, armor, dodge, health, hunger

def apply_gear_to_baseline(gear_choice):
    out = BASELINE.copy()
    total_gear_cost = 0.0
    for i, slot in enumerate(GEAR_SLOTS):
        tier_idx = gear_choice[slot]
        if slot == "weapon":
            tier = WEAPON_TIERS[int(tier_idx)]
        else:
            tier = GEAR_TIERS[int(tier_idx)]
        data = GEAR[slot][tier]
        total_gear_cost += data["cost"]
        for stat, delta in data["mods"].items():
            out[stat] = out.get(stat, 0) + delta
    return out, total_gear_cost
