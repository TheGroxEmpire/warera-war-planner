#!/bin/bash
python -c "from warera.api import update_gear_prices_from_api, update_food_and_ammo_from_api; update_gear_prices_from_api(); update_food_and_ammo_from_api()"
gunicorn warera.app:app
