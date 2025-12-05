from .config import HEALTH_RECOVERY_RATE_PER_HOUR, HOURS_PER_DAY, HUNGER_RECOVERY_RATE_PER_HOUR, GEAR_SLOTS, WEAPON_TIERS, GEAR_TIERS, AMMO_NAMES, FOOD_NAMES, AMMO, FOOD, GEAR
from .stats import apply_gear_to_baseline, make_skill_tables

# =========================================
# DAMAGE / ATTACKS / COST MODEL
# =========================================

def expected_damage_per_attack(atk, prc, critc, critd):
    """Expected damage per attack with graze (miss) penalty like your original."""
    return atk * prc * (1 + critc * critd) + (atk / 2.0) * (1 - prc)

def attacks_possible(hp, hun, armor, dodge, food_regen_bonus):
    regen_base = hp * HEALTH_RECOVERY_RATE_PER_HOUR * HOURS_PER_DAY
    regen_all = regen_base + hun * HUNGER_RECOVERY_RATE_PER_HOUR * HOURS_PER_DAY * food_regen_bonus
    cost_per_attack = 10 * (1 - armor) * (1 - dodge)
    return max(0.0, regen_all / max(1e-9, cost_per_attack))

def compute_totals(skill_levels, gear_idx, ammo_idx, food_idx):
    """Compute total_damage and total_cost for a single solution."""

    # Decode gear choices
    gear_choice = {slot: int(gear_idx[i]) for i, slot in enumerate(GEAR_SLOTS)}

    # Baseline with gear mods applied
    combined_baseline, _ = apply_gear_to_baseline(gear_choice)

    # Extract skill tables
    atk_tab, prc_tab, critc_tab, critd_tab, arm_tab, ddg_tab, hp_tab, hun_tab = make_skill_tables(combined_baseline)

    # Pick skill levels
    atk   = atk_tab[int(skill_levels[0])]
    prc   = prc_tab[int(skill_levels[1])]
    critc = critc_tab[int(skill_levels[2])]
    critd = critd_tab[int(skill_levels[3])]
    arm   = arm_tab[int(skill_levels[4])]
    ddg   = ddg_tab[int(skill_levels[5])]
    hp    = hp_tab[int(skill_levels[6])]
    hun   = hun_tab[int(skill_levels[7])]

    # Decode weapon tier
    weapon_tier_idx = int(gear_idx[0])  # first slot is weapon
    weapon_tier = WEAPON_TIERS[weapon_tier_idx]

    # Ammo / food
    ammo_name = AMMO_NAMES[int(ammo_idx)]
    food_name = FOOD_NAMES[int(food_idx)]
    ammo = AMMO[ammo_name]
    food = FOOD[food_name]


    dmg_per_attack = expected_damage_per_attack(atk, prc, critc, critd)
    if globals().get("PILL_MODE", False):
        if ammo_name != "none":  # apply ammo bonus only if ammo is used
            dmg_per_attack *= (1.0 + 0.8 + ammo["dmg_bonus"])  # +80% with ammo
        else:
            dmg_per_attack *= (1.0 + 0.8 )  # +80% no ammo
    else:
        if ammo_name != "none":  # apply ammo bonus only if ammo is used
            dmg_per_attack *= (1.0 + ammo["dmg_bonus"])  # ammo no 80%

    # Attacks possible
    n_attacks = attacks_possible(hp, hun, arm, ddg, food["regen_bonus"])

    # --- Costs ---
    # Gear costs (weapons don’t decay by dodge, others do)
    gear_cost_total = 0.0
    for i, slot in enumerate(GEAR_SLOTS):
        tier_idx = int(gear_idx[i])
        if slot == "weapon":
            tier = WEAPON_TIERS[tier_idx]
            if tier != "none":
                gear_cost_total += GEAR[slot][tier]["cost"] / GEAR[slot][tier]["uses"] * n_attacks
        else:
            tier = GEAR_TIERS[tier_idx]
            if tier != "none":
                gear_cost_total += GEAR[slot][tier]["cost"] / GEAR[slot][tier]["uses"] * n_attacks * (1 - ddg)

    # Food + ammo costs
    food_cost = food["cost"] * hun * 2.4
    ammo_cost = 0.0
    if ammo_name != "none":
        ammo_cost = ammo["bullet_cost"] * n_attacks

    total_cost = gear_cost_total + food_cost + ammo_cost
    total_damage = dmg_per_attack * n_attacks

    return total_damage, total_cost, {
        "atk": atk, "prc": prc, "critc": critc, "critd": critd,
        "arm": arm, "ddg": ddg, "hp": hp, "hun": hun,
        "dmg_per_attack": dmg_per_attack, "n_attacks": n_attacks,
        "gear_cost": gear_cost_total, "food_cost": food_cost, "ammo_bullet_cost": ammo_cost,
    }
