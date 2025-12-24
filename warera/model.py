import numpy as np
from .config import HEALTH_RECOVERY_RATE_PER_HOUR, HOURS_PER_DAY, HUNGER_RECOVERY_RATE_PER_HOUR, GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, AMMO_NAMES, FOOD_NAMES, AMMO, FOOD, GEAR
from .stats import apply_gear_to_baseline, make_skill_tables

# =========================================
# DAMAGE / ATTACKS / COST MODEL
# =========================================

def attacks_possible(hp, hun, armor, dodge, food_regen_bonus):
    """Calculates the number of attacks possible based on health regeneration and attack cost."""
    # HP regenerated per day from baseline health and hunger, including food bonus
    regen_base = hp * HEALTH_RECOVERY_RATE_PER_HOUR * HOURS_PER_DAY
    regen_all = regen_base + hun * HUNGER_RECOVERY_RATE_PER_HOUR * HOURS_PER_DAY * food_regen_bonus
    
    # Cost per attack, adjusted for armor and dodge
    cost_per_attack = 10 * (1 - armor) * (1 - dodge)
    
    # Avoid division by zero, though cost_per_attack should be > 0 in practice
    return np.maximum(0.0, regen_all / np.maximum(1e-9, cost_per_attack))

def compute_totals(skill_levels, gear_idx, ammo_idx, food_idx, rank_bonus=1.45, pill_mode=False, tables=None):
    """Compute total_damage and total_cost for a single solution."""

    if tables is None:
        # Decode gear choices
        gear_choice = {slot: int(gear_idx[i]) for i, slot in enumerate(GEAR_SLOTS)}
        # Baseline with gear mods applied
        combined_baseline, _ = apply_gear_to_baseline(gear_choice)
        # Extract skill tables
        tables = make_skill_tables(combined_baseline)

    # Pick skill levels
    atk   = tables[0][int(skill_levels[0])]
    prc   = min(1.0, tables[1][int(skill_levels[1])])
    critc = min(1.0, tables[2][int(skill_levels[2])])
    critd = tables[3][int(skill_levels[3])]
    arm   = min(0.9, tables[4][int(skill_levels[4])])
    ddg   = tables[5][int(skill_levels[5])]
    hp    = tables[6][int(skill_levels[6])]
    hun   = tables[7][int(skill_levels[7])]

    # Ammo / food
    ammo = AMMO[AMMO_NAMES[int(ammo_idx)]]
    food = FOOD[FOOD_NAMES[int(food_idx)]]

    pill_bonus = 1.6 if pill_mode else 1.0
    atk *= pill_bonus * (1.0 + ammo["dmg_bonus"]) * rank_bonus

    dmg_per_attack = atk * prc * (1 + critc * critd) + (atk / 2.0) * (1 - prc)
    n_attacks = attacks_possible(hp, hun, arm, ddg, food["regen_bonus"])

    # Gear costs (weapons don’t decay by dodge, others do)
    gear_cost_total = 0.0
    for i, slot in enumerate(GEAR_SLOTS):
        tier = WEAPON_TIERS[int(gear_idx[i])] if slot == "weapon" else GEAR_TIERS[int(gear_idx[i])]
        decay_multiplier = 1 if slot == "weapon" else (1 - ddg)
        gear_cost_total += (GEAR[slot][tier]["cost"] / 100) * n_attacks * decay_multiplier

    day_multiplier = 1.7 if pill_mode else 2.4
    food_cost = food["cost"] * hun * day_multiplier
    ammo_cost = ammo["bullet_cost"] * n_attacks

    total_cost = gear_cost_total + food_cost + ammo_cost
    total_damage = dmg_per_attack * n_attacks

    return total_damage, total_cost, {
        "atk": atk, "prc": prc, "critc": critc, "critd": critd,
        "arm": arm, "ddg": ddg, "hp": hp, "hun": hun,
        "dmg_per_attack": dmg_per_attack, "n_attacks": n_attacks,
        "gear_cost": gear_cost_total, "food_cost": food_cost, "ammo_bullet_cost": ammo_cost,
    }
