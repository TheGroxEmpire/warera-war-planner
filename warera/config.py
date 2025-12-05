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
    # name: {"regen_bonus": int, "cost": float}
    "nofood": {"regen_bonus": 0,  "cost": 0},
    "bread":  {"regen_bonus": 10, "cost": 0.7},
    "steak":   {"regen_bonus": 20, "cost": 1.5},
    "cookedFish":   {"regen_bonus": 30, "cost": 3.4},
}
FOOD_NAMES = list(FOOD.keys())

# AMMO: damage bonus multiplier and cost *per attack* (each attack uses one bullet)
AMMO = {
    "none":   {"dmg_bonus": 0.0, "bullet_cost": 0},
    "green":  {"dmg_bonus": 0.1, "bullet_cost": 0.1},
    "blue":   {"dmg_bonus": 0.2, "bullet_cost": 0.36},
    "purple": {"dmg_bonus": 0.4, "bullet_cost": 1.5},
}
AMMO_NAMES = list(AMMO.keys())

# GEAR SLOTS and TIERS
GEAR_SLOTS = ["weapon", "helmet", "chest", "pants", "gloves", "boots"]
GEAR_TIERS = ["none", "grey", "green", "blue", "purple", "gold", "red"]
WEAPON_TIERS = ["none", "knife", "gun", "rifle", "sniper", "tank", "jet"]

SLOT_CODES = {
    "weapon": "weapon",
    "helmet": "helmet",
    "chest": "chest",
    "pants": "pants",
    "gloves": "gloves",
    "boots": "boots",
}

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
        "none":   {"mods": {}, "cost": 0, "uses": 100},
        "knife":   {"mods": {"atk": 40, "critc": 5},   "cost": 2, "uses": 100},
        "gun":  {"mods": {"atk": 60, "critc": 10},   "cost": 8, "uses": 100},
        "rifle":   {"mods": {"atk": 90, "critc": 15},   "cost": 27, "uses": 100},
        "sniper": {"mods": {"atk": 120, "critc": 20},  "cost": 90, "uses": 100},
        "tank":   {"mods": {"atk": 160, "critc": 30},  "cost": 320, "uses": 100},
        "jet":   {"mods": {"atk": 280, "critc": 40},  "cost": 700, "uses": 100},
    },
    "helmet": {
        "none":   {"mods": {}, "cost": 0, "uses": 100},
        "grey":   {"mods": {"critd": 10},    "cost": 1, "uses": 100},
        "green":  {"mods": {"critd": 20},    "cost": 4, "uses": 100},
        "blue":   {"mods": {"critd": 30},    "cost": 15, "uses": 100},
        "purple": {"mods": {"critd": 40},   "cost": 40, "uses": 100},
        "gold":   {"mods": {"critd": 60},   "cost": 180, "uses": 100},
        "red":   {"mods": {"critd": 80},   "cost": 600, "uses": 100},
    },
    "chest": {
        "none":   {"mods": {}, "cost": 0, "uses": 100},
        "grey":   {"mods": {"arm": 5},    "cost": 2, "uses": 100},
        "green":  {"mods": {"arm": 10},    "cost": 5, "uses": 100},
        "blue":   {"mods": {"arm": 15},    "cost": 16, "uses": 100},
        "purple": {"mods": {"arm": 20},   "cost": 45, "uses": 100},
        "gold":   {"mods": {"arm": 30},   "cost": 130, "uses": 100},
        "red":   {"mods": {"critd": 40},   "cost": 700, "uses": 100},
    },
    "pants": {
        "none":   {"mods": {}, "cost": 0, "uses": 100},
        "grey":   {"mods": {"arm": 5},    "cost": 1.5, "uses": 100},
        "green":  {"mods": {"arm": 10},    "cost": 4, "uses": 100},
        "blue":   {"mods": {"arm": 15},    "cost": 15, "uses": 100},
        "purple": {"mods": {"arm": 20},   "cost": 40, "uses": 100},
        "gold":   {"mods": {"arm": 30},   "cost": 110, "uses": 100},
        "red":   {"mods": {"critd": 40},   "cost": 700, "uses": 100},
    },
    "gloves": {
        "none":   {"mods": {}, "cost": 0, "uses": 100},
        "grey":   {"mods": {"prc": 5},    "cost": 1.5, "uses": 100},
        "green":  {"mods": {"prc": 10},    "cost": 6, "uses": 100},
        "blue":   {"mods": {"prc": 15},    "cost": 20, "uses": 100},
        "purple": {"mods": {"prc": 20},   "cost": 60, "uses": 100},
        "gold":   {"mods": {"prc": 30},   "cost": 200, "uses": 100},
        "red":   {"mods": {"critd": 40},   "cost": 900, "uses": 100},
    },
    "boots": {
        "none":   {"mods": {}, "cost": 0, "uses": 100},
        "grey":   {"mods": {"ddg": 5},    "cost": 1.5, "uses": 100},
        "green":  {"mods": {"ddg": 10},    "cost": 5, "uses": 100},
        "blue":   {"mods": {"ddg": 15},    "cost": 17, "uses": 100},
        "purple": {"mods": {"ddg": 20},   "cost": 60, "uses": 100},
        "gold":   {"mods": {"ddg": 30},   "cost": 150, "uses": 100},
        "red":   {"mods": {"critd": 40},   "cost": 500, "uses": 100},
    },
}
