import numpy as np

# =========================================
# CONFIGURABLE GAME DATA (placeholders)
# Replace these tables with your real data.
# =========================================

# Baseline (no gear) stat anchors
BASELINE = {
    "atk": 100,   # base attack stat
    "prc": 50,    # base precision %
    "critc": 10,  # base critical chance %
    "critd": 100,  # base critical damage %
    "arm": 0,     # base armor %
    "ddg": 0,     # base dodge %
    "hp": 50,     # base health
    "hun": 4,     # base hunger
}

# What each *skill* level does (same interpretation as your original script)
SKILL_POINTS_PER_LEVEL = 4
MAX_SKILL_LEVEL = 10
HEALTH_RECOVERY_RATE_PER_HOUR = 0.10
HUNGER_RECOVERY_RATE_PER_HOUR = 0.10
HOURS_PER_DAY = 24

SKILL_NAMES = ["Attack", "Precision", "Crit. Chance", "Crit. Dmg", "Armor", "Dodge", "Health", "Hunger"]

# Cost of skill levels for a single skill (triangular numbers 0,1,3,6,...)
SKILL_LEVEL_COST = np.array([lvl * (lvl + 1) // 2 for lvl in range(MAX_SKILL_LEVEL + 1)])

# FOOD: regen bonuses and one-time cost (per simulation/day/encounter)
FOOD = {
    "bread":  {"regen_bonus": 10, "cost": 0.7},
    "steak":   {"regen_bonus": 20, "cost": 1.5},
    "cookedFish":   {"regen_bonus": 30, "cost": 3.4},
}
FOOD_NAMES = list(FOOD.keys())

# AMMO: damage bonus multiplier and cost *per attack* (each attack uses one bullet)
AMMO = {
    "lightAmmo":  {"dmg_bonus": 0.1, "bullet_cost": 0.1},
    "ammo":   {"dmg_bonus": 0.2, "bullet_cost": 0.36},
    "heavyAmmo": {"dmg_bonus": 0.4, "bullet_cost": 1.5},
}
AMMO_NAMES = list(AMMO.keys())

AMMO_API_MAPPING = {
    "green": "lightAmmo",
    "blue": "ammo",
    "purple": "heavyAmmo"
}

# GEAR SLOTS and TIERS
GEAR_SLOTS = ["weapon", "helmet", "gloves", "chest", "pants", "boots"]
GEAR_TIERS = ["grey", "green", "blue", "purple", "gold", "red"]
WEAPON_TIERS = ["knife", "gun", "rifle", "sniper", "tank", "jet"]

TIER_NUM = {
    "grey": 1,
    "green": 2,
    "blue": 3,
    "purple": 4,
    "gold": 5,
    "red": 6,
}

# Each slot+tier applies additive modifiers to one or more stats + has a purchase cost.
# These are *placeholder* numbers so the program runs end-to-end; edit freely.
GEAR = {
    "weapon": {
        "knife":   {"mods": {"atk": 36, "critc": 5},   "cost": 2},
        "gun":  {"mods": {"atk": 68, "critc": 9},   "cost": 8},
        "rifle":   {"mods": {"atk": 86, "critc": 14},   "cost": 27},
        "sniper": {"mods": {"atk": 114, "critc": 18},  "cost": 90},
        "tank":   {"mods": {"atk": 152, "critc": 27},  "cost": 320},
        "jet":   {"mods": {"atk": 240, "critc": 36},  "cost": 700},
    },
    "helmet": {
        "grey":   {"mods": {"critd": 10},    "cost": 2},
        "green":  {"mods": {"critd": 18},    "cost": 6},
        "blue":   {"mods": {"critd": 27},    "cost": 20},
        "purple": {"mods": {"critd": 36},   "cost": 50},
        "gold":   {"mods": {"critd": 55},   "cost": 160},
        "red":   {"mods": {"critd": 74},   "cost": 500},
    },
    "gloves": {
        "grey":   {"mods": {"prc": 5},    "cost": 2},
        "green":  {"mods": {"prc": 9},    "cost": 6},
        "blue":   {"mods": {"prc": 14},    "cost": 20},
        "purple": {"mods": {"prc": 18},   "cost": 50},
        "gold":   {"mods": {"prc": 27},   "cost": 160},
        "red":   {"mods": {"prc": 36},   "cost": 500},
    },
    "chest": {
        "grey":   {"mods": {"arm": 5},    "cost": 2},
        "green":  {"mods": {"arm": 9},    "cost": 6},
        "blue":   {"mods": {"arm": 14},    "cost": 20},
        "purple": {"mods": {"arm": 18},   "cost": 50},
        "gold":   {"mods": {"arm": 27},   "cost": 160},
        "red":   {"mods": {"critd": 36},   "cost": 500},
    },
    "pants": {
        "grey":   {"mods": {"arm": 5},    "cost": 2},
        "green":  {"mods": {"arm": 9},    "cost": 6},
        "blue":   {"mods": {"arm": 14},    "cost": 20},
        "purple": {"mods": {"arm": 18},   "cost": 50},
        "gold":   {"mods": {"arm": 27},   "cost": 160},
        "red":   {"mods": {"critd": 36},   "cost": 500},
    },
    "boots": {
        "grey":   {"mods": {"ddg": 5},    "cost": 1.5},
        "green":  {"mods": {"ddg": 9},    "cost": 5},
        "blue":   {"mods": {"ddg": 14},    "cost": 17},
        "purple": {"mods": {"ddg": 18},   "cost": 60},
        "gold":   {"mods": {"ddg": 27},   "cost": 140},
        "red":   {"mods": {"critd": 36},   "cost": 500},
    },
}
