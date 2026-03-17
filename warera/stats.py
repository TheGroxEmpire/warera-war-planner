import numpy as np
from .config import MAX_SKILL_LEVEL, GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, GEAR, BASELINE

# =========================================
# STAT TABLES (skill progression curves)
# =========================================

def make_skill_tables(baseline, scaling_mode='dev', health_scaling='prod', hp_step=15):
    """Return per-skill arrays of stat values for levels 0..MAX_SKILL_LEVEL."""
    lvls = np.arange(MAX_SKILL_LEVEL + 1)
    atk_step = 25 if scaling_mode == 'dev' else 20
    attack = baseline["atk"] + atk_step * lvls
    precision = baseline["prc"]/100 + 0.05 * lvls
    critc = baseline["critc"]/100 + 0.05 * lvls
    critd = baseline["critd"]/100 + 0.20 * lvls
    arm_step = 6 if scaling_mode == 'dev' else 4
    ddg_step = 4
    armor = baseline["arm"] + arm_step * lvls
    dodge = baseline["ddg"] + ddg_step * lvls
    hp_step = hp_step if health_scaling == 'dev' else 10
    health = baseline["hp"] + hp_step * lvls
    hunger = baseline["hun"] + 1 * lvls
    return attack, precision, critc, critd, armor, dodge, health, hunger

def apply_gear_to_baseline(gear_choice, base_hp=None, base_hun=None, armor_gear_multiplier=1.0):
    out = BASELINE.copy()
    if base_hp is not None:
        out["hp"] = base_hp
    if base_hun is not None:
        out["hun"] = base_hun
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
            delta_applied = delta * armor_gear_multiplier if stat == "arm" else delta
            out[stat] = out.get(stat, 0) + delta_applied
    return out, total_gear_cost
