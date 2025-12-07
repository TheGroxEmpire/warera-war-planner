import requests
import json
from .config import WEAPON_TIERS, TIER_NUM, GEAR, FOOD_NAMES, AMMO_NAMES, FOOD, AMMO, GEAR_SLOTS

# =========================================
# HELPERS
# =========================================

def fetch_equipment_prices(slots=None):
    """
    Fetch average market prices from the WarEra API for all slot+tier combinations.
    Returns a dict like {slot: {tier: avgPrice, ...}, ...}
    """
    if slots is None:
        slots = GEAR_SLOTS

    batch_input = {}
    idx = 0

    for slot in slots:
        if slot == "weapon":
            for weapon in WEAPON_TIERS:
                batch_input[str(idx)] = {"itemCode": weapon}
                idx += 1
        else:
            for tier, num in TIER_NUM.items():
                item_code = f"{slot}{num}"
                batch_input[str(idx)] = {"itemCode": item_code}
                idx += 1

    url = (
        "https://api2.warera.io/trpc/"
        + ",".join(["gameStat.getEquipmentAvgByCode"] * len(batch_input))
        + f"?batch=1&input={requests.utils.quote(json.dumps(batch_input))}"
    )

    print(f"[fetch_equipment_prices] Fetching {len(batch_input)} items...")
    resp = requests.get(url)
    resp.raise_for_status()
    data = resp.json()

    prices = {slot: {} for slot in slots}
    i = 0
    for slot in slots:
        if slot == "weapon":
            for weapon in WEAPON_TIERS:
                if weapon == "none":
                    prices[slot][weapon] = 0
                    continue
                try:
                    avg_price = data[i]["result"]["data"]
                    if avg_price and avg_price > 0:
                        prices[slot][weapon] = avg_price
                        print(f"  - {slot} {weapon}: {avg_price}")
                    else:
                        prices[slot][weapon] = GEAR[slot][weapon]["cost"]
                        print(f"  - {slot} {weapon}: API gave 0 -> keeping {prices[slot][weapon]}")
                except Exception as e:
                    prices[slot][weapon] = GEAR[slot][weapon]["cost"]
                    print(f"  - {slot} {weapon}: ERROR {e} -> keeping {prices[slot][weapon]}")
                i += 1
        else:
            for tier, num in TIER_NUM.items():
                if tier == "none":
                    prices[slot][tier] = 0
                    continue
                try:
                    avg_price = data[i]["result"]["data"]
                    if avg_price and avg_price > 0:
                        prices[slot][tier] = avg_price
                        print(f"  - {slot} {tier}: {avg_price}")
                    else:
                        prices[slot][tier] = GEAR[slot][tier]["cost"]
                        print(f"  - {slot} {tier}: API gave 0 -> keeping {prices[slot][tier]}")
                except Exception as e:
                    prices[slot][tier] = GEAR[slot][tier]["cost"]
                    print(f"  - {slot} {tier}: ERROR {e} -> keeping {prices[slot][tier]}")
                i += 1

    return prices


def fetch_food_and_bullet_prices():
    url = "https://api2.warera.io/trpc/itemTrading.getPrices"
    print(f"[fetch_food_and_bullet_prices] Fetching...")
    resp = requests.get(url)
    resp.raise_for_status()
    data = resp.json()
    result = data["result"]["data"]
    for k, v in result.items():
        print(f"  - {k}: {v}")
    return result


def update_food_and_ammo_from_api():
    prices = fetch_food_and_bullet_prices()

    for food_name in FOOD_NAMES:
        if food_name in prices:
            old = FOOD[food_name]["cost"]
            FOOD[food_name]["cost"] = prices[food_name]
            print(f"[FOOD] {food_name}: {old} -> {prices[food_name]}")

    mapping = {
        "green": "lightAmmo",
        "blue": "ammo",
        "purple": "heavyAmmo"
    }
    for ammo_name, code in mapping.items():
        if code in prices:
            old = AMMO[ammo_name]["bullet_cost"]
            AMMO[ammo_name]["bullet_cost"] = prices[code]
            print(f"[AMMO] {ammo_name}: {old} -> {prices[code]}")

    print("Updated FOOD and AMMO prices from API.")


def update_gear_prices_from_api():
    prices = fetch_equipment_prices()
    for slot, tiers in prices.items():
        for tier, price in tiers.items():
            if price and price > 0:
                old = GEAR[slot][tier]["cost"]
                GEAR[slot][tier]["cost"] = price
                print(f"[GEAR] {slot} {tier}: {old} -> {price}")
            else:
                print(f"[GEAR] {slot} {tier}: keeping hardcoded {GEAR[slot][tier]['cost']}")
    print("Updated gear prices from API.")
