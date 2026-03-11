import numpy as np
from .config import MAX_SKILL_LEVEL, GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, GEAR, BASELINE

# =========================================
# STAT TABLES (skill progression curves)
# =========================================

def make_skill_tables(baseline, scaling_mode='dev'):
    """Return per-skill arrays of stat values for levels 0..MAX_SKILL_LEVEL."""
    lvls = np.arange(MAX_SKILL_LEVEL + 1)
    attack = baseline["atk"] + 20 * lvls
    precision = np.minimum(1.0, baseline["prc"]/100 + 0.05 * lvls)
    critc = np.minimum(1.0, baseline["critc"]/100 + 0.05 * lvls)
    critd = baseline["critd"]/100 + 0.20 * lvls
    arm_step = 5 if scaling_mode == 'dev' else 4
    ddg_step = 5 if scaling_mode == 'dev' else 4
    armor = baseline["arm"] + arm_step * lvls
    dodge = baseline["ddg"] + ddg_step * lvls
    health = baseline["hp"] + 10 * lvls
    hunger = baseline["hun"] + 1 * lvls
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
