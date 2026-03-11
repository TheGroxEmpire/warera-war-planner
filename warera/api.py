import requests
import json
import logging
import time
import os

from .config import WEAPON_TIERS, TIER_NUM, GEAR, FOOD_NAMES, AMMO_NAMES, FOOD, AMMO, GEAR_SLOTS, AMMO_API_MAPPING, SCRAP_API_CODE, CASE_API_CODE

# Configure logging
logger = logging.getLogger(__name__)

_SCRAP_PRICE = 0
_CASE1_PRICE = 0

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
    """Fetches food, bullet, and scrap prices from the WarEra API."""
    item_codes_to_fetch = list(AMMO_API_MAPPING.values()) + FOOD_NAMES
    if SCRAP_API_CODE:
        item_codes_to_fetch.append(SCRAP_API_CODE)
    if CASE_API_CODE:
        item_codes_to_fetch.append(CASE_API_CODE)
    
    batch_input = {str(i): {"itemCode": code} for i, code in enumerate(item_codes_to_fetch)}
    url = (
        "https://api2.warera.io/trpc/" +
        ",".join(["itemTrading.getPrices"] * len(batch_input)) +
        f"?batch=1&input={requests.utils.quote(json.dumps(batch_input))}"
    )
    logger.info("Fetching food, bullet, and scrap prices...")
    data = api_request(url)
    if data:
        prices = {}
        try:
            # API returns an array when batched, but all items are in the first response
            # Structure: [{"result": {"data": {"itemCode": price, ...}}}, ...]
            if isinstance(data, list):
                # Take the first batch response which contains all items
                response_data = data[0] if len(data) > 0 else {}
            else:
                response_data = data
            
            price_data = response_data.get("result", {}).get("data", {})
            for code in item_codes_to_fetch:
                if code in price_data:
                    price = price_data[code]
                    prices[code] = price
                    logger.debug(f"  - {code}: {price}")
                else:
                    logger.warning(f"  - {code}: not found in API response")
        except (KeyError, TypeError, IndexError) as e:
            logger.error(f"Error parsing API response: {e}")
        return prices
    return {}


def update_food_and_ammo_from_api():
    """Updates food, ammo, and scrap prices in the config from the API."""
    prices = fetch_food_and_bullet_prices()

    for food_name in FOOD_NAMES:
        if food_name in prices:
            old_price = FOOD[food_name]["cost"]
            price_data = prices[food_name]
            # Handle case where API returns nested dict structure
            if isinstance(price_data, dict):
                new_price = price_data.get('price', price_data.get('value', price_data.get('cost', old_price)))
            else:
                new_price = price_data
            FOOD[food_name]["cost"] = new_price
            logger.info(f"[FOOD] {food_name}: {old_price} -> {new_price}")

    for ammo_name, code in AMMO_API_MAPPING.items():
        if code in prices:
            old_price = AMMO[code]["bullet_cost"]
            price_data = prices[code]
            # Handle case where API returns nested dict structure
            if isinstance(price_data, dict):
                new_price = price_data.get('price', price_data.get('value', price_data.get('cost', old_price)))
            else:
                new_price = price_data
            AMMO[code]["bullet_cost"] = new_price
            logger.info(f"[AMMO] {ammo_name}: {old_price} -> {new_price}")
    
    global _SCRAP_PRICE
    if SCRAP_API_CODE in prices:
        scrap_data = prices[SCRAP_API_CODE]
        # Handle case where API returns nested dict structure
        if isinstance(scrap_data, dict):
            # Try to extract numeric value from common response structures
            _SCRAP_PRICE = scrap_data.get('price', scrap_data.get('value', scrap_data.get('cost', 0)))
        else:
            _SCRAP_PRICE = scrap_data
        logger.info(f"[SCRAP] price: {_SCRAP_PRICE}")
    else:
        logger.warning(f"[SCRAP] {SCRAP_API_CODE} not found in API response. Defaulting to 0.")

    global _CASE1_PRICE
    if CASE_API_CODE in prices:
        case_data = prices[CASE_API_CODE]
        if isinstance(case_data, dict):
            _CASE1_PRICE = case_data.get('price', case_data.get('value', case_data.get('cost', 0)))
        else:
            _CASE1_PRICE = case_data
        logger.info(f"[CASE1] price: {_CASE1_PRICE}")
    else:
        logger.warning(f"[CASE1] {CASE_API_CODE} not found in API response. Defaulting to 0.")

    logger.info("Updated FOOD, AMMO, and SCRAP prices from API.")


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


def get_scrap_price():
    """Returns the fetched scrap price, fetching if not already available."""
    global _SCRAP_PRICE
    if _SCRAP_PRICE == 0:
        update_food_and_ammo_from_api()
    return _SCRAP_PRICE


def get_case1_price():
    """Returns the fetched case1 price, fetching if not already available."""
    global _CASE1_PRICE
    if _CASE1_PRICE == 0:
        update_food_and_ammo_from_api()
    return _CASE1_PRICE
