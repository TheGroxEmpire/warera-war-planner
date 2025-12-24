import os
import numpy as np
import logging

gunicorn_logger = logging.getLogger("gunicorn.error")

def get_tier_color(tier):
    colors = {
        "grey": "rgb(58, 71, 83)", "green": "rgb(33, 88, 53)", "blue": "rgb(27, 54, 114)", "purple": "rgb(68, 46, 102)", "gold": "rgb(86, 83, 40)", "red": "rgb(103, 31, 31)",
        "knife": "rgb(58, 71, 83)", "gun": "rgb(33, 88, 53)", "rifle": "rgb(27, 54, 114)", "sniper": "rgb(68, 46, 102)", "tank": "rgb(86, 83, 40)", "jet": "rgb(103, 31, 31)"
    }
    return colors.get(tier.lower(), "rgb(58, 71, 83)")

def get_consumable_color(name):
    if "light" in name.lower() or "bread" in name.lower():
        return "rgb(33, 88, 53)"
    if "heavy" in name.lower() or "fish" in name.lower():
        return "rgb(68, 46, 102)"
    if "ammo" in name.lower() or "steak" in name.lower():
        return "rgb(27, 54, 114)"
    return "rgb(58, 71, 83)"

def format_number(num):
    if num >= 1000000:
        return f"{num/1000000:.2f}M"
    if num > 1000:
        return f"{num/1000:.1f}K"
    return f"{num:.2f}"

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
