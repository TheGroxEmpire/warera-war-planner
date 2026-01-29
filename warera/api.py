import requests
import json
import logging
import time
import os

from .config import WEAPON_TIERS, TIER_NUM, GEAR, FOOD_NAMES, AMMO_NAMES, FOOD, AMMO, GEAR_SLOTS, AMMO_API_MAPPING

# Configure logging
logger = logging.getLogger(__name__)

API_KEY = os.environ.get('WARERA_API_KEY', 'wae_df98b2cf737089a80db9f84b435c7cc3ada1ecfb1a5122760a4270eed8b29bf6')
MIN_REQUEST_INTERVAL = 0.35  # 200 requests per minute = 1 every 0.3s, 0.35s to be safe
last_request_time = 0

def api_request(url):
    """Helper function to make a rate-limited API request with the API key."""
    global last_request_time
    
    elapsed = time.time() - last_request_time
    if elapsed < MIN_REQUEST_INTERVAL:
        time.sleep(MIN_REQUEST_INTERVAL - elapsed)
    
    last_request_time = time.time()
    
    headers = {
        'X-API-Key': API_KEY
    }
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"API request failed for {url}: {e}")
        return None

def fetch_equipment_prices(slots=None):
    """
    Fetch average market prices from the WarEra API for all slot+tier combinations.
    Returns a dict like {slot: {tier: avgPrice, ...}, ...}
    """
    if slots is None:
        slots = GEAR_SLOTS

    batch_input = {}
    idx = 0
    item_keys = []

    for slot in slots:
        tiers = WEAPON_TIERS if slot == "weapon" else TIER_NUM.keys()
        for tier in tiers:
            if slot == "weapon":
                item_code = tier
            else:
                item_code = f"{slot}{TIER_NUM[tier]}"
            batch_input[str(idx)] = {"itemCode": item_code}
            item_keys.append((slot, tier))
            idx += 1
    
    url = (
        "https://api2.warera.io/trpc/"
        + ",".join(["gameStat.getEquipmentAvgByCode"] * len(batch_input))
        + f"?batch=1&input={requests.utils.quote(json.dumps(batch_input))}"
    )

    logger.info(f"Fetching {len(batch_input)} equipment prices...")
    data = api_request(url)
    if not isinstance(data, list):
        logger.error(f"Unexpected API response format: {data}")
        return {}

    prices = {slot: {} for slot in slots}
    for i, (slot, tier) in enumerate(item_keys):
        try:
            avg_price = data[i]["result"]["data"]
            if avg_price and avg_price > 0:
                prices[slot][tier] = avg_price
                logger.debug(f"  - {slot} {tier}: {avg_price}")
            else:
                prices[slot][tier] = GEAR[slot][tier]["cost"]
                logger.warning(f"  - {slot} {tier}: API gave 0 -> keeping {prices[slot][tier]}")
        except (IndexError, KeyError, TypeError) as e:
            prices[slot][tier] = GEAR[slot][tier]["cost"]
            logger.error(f"  - {slot} {tier}: ERROR {e} -> keeping {prices[slot][tier]}")

    return prices


def fetch_food_and_bullet_prices():
    """Fetches food and bullet prices from the WarEra API."""
    url = "https://api2.warera.io/trpc/itemTrading.getPrices"
    logger.info("Fetching food and bullet prices...")
    data = api_request(url)
    if data:
        result = data.get("result", {}).get("data", {})
        for k, v in result.items():
            logger.debug(f"  - {k}: {v}")
        return result
    return {}


def update_food_and_ammo_from_api():
    """Updates food and ammo prices in the config from the API."""
    prices = fetch_food_and_bullet_prices()

    for food_name in FOOD_NAMES:
        if food_name in prices:
            old_price = FOOD[food_name]["cost"]
            new_price = prices[food_name]
            FOOD[food_name]["cost"] = new_price
            logger.info(f"[FOOD] {food_name}: {old_price} -> {new_price}")

    for ammo_name, code in AMMO_API_MAPPING.items():
        if code in prices:
            old_price = AMMO[code]["bullet_cost"]
            new_price = prices[code]
            AMMO[code]["bullet_cost"] = new_price
            logger.info(f"[AMMO] {ammo_name}: {old_price} -> {new_price}")

    logger.info("Updated FOOD and AMMO prices from API.")


def update_gear_prices_from_api():
    """Updates gear prices in the config from the API."""
    prices = fetch_equipment_prices()
    for slot, tiers in prices.items():
        for tier, price in tiers.items():
            if price and price > 0:
                old_price = GEAR[slot][tier]["cost"]
                GEAR[slot][tier]["cost"] = price
                logger.info(f"[GEAR] {slot} {tier}: {old_price} -> {price}")
            else:
                logger.warning(f"[GEAR] {slot} {tier}: keeping hardcoded {GEAR[slot][tier]['cost']}")
    logger.info("Updated gear prices from API.")
