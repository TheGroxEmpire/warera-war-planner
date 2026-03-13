import numpy as np

def select_builds(details, min_damage=100000, max_damage=5000000, num_builds=15, cost_key="total_cost"):
    """
    Selects a specified number of builds from a list of build details,
    based on damage range and efficiency. The builds are chosen as local
    peaks of efficiency within evenly spread damage bands.

    Args:
        details (list): A list of dictionaries, where each dictionary
                        represents a build and contains at least
                        "total_damage" and "total_cost".
        min_damage (int): The minimum damage for the builds to be selected.
        max_damage (int): The maximum damage for the builds to be selected.
        num_builds (int): The number of builds to select.
        cost_key (str): The key to use for cost when computing efficiency.

    Returns:
        list: A list of the selected builds.
    """

    # Filter builds within the specified damage range
    filtered_builds = [
        d for d in details
        if min_damage <= d["total_damage"] <= max_damage
    ]

    if not filtered_builds:
        return []

    # Create evenly spaced damage bands
    damage_bands = np.linspace(min_damage, max_damage, num_builds + 1)

    best_builds_by_band = {}

    for i in range(num_builds):
        band_min = damage_bands[i]
        band_max = damage_bands[i+1]
        
        builds_in_band = [
            d for d in filtered_builds
            if band_min <= d["total_damage"] < band_max
        ]
        
        if builds_in_band:
            # Calculate efficiency for each build in the band
            for build in builds_in_band:
                if build[cost_key] > 0:
                    build["efficiency"] = build["total_damage"] / build[cost_key]
                else:
                    build["efficiency"] = 0
            
            # Find the most efficient build in the band
            best_build = max(builds_in_band, key=lambda x: x["efficiency"])
            best_builds_by_band[i] = best_build

    selected = list(best_builds_by_band.values())

    return selected


def select_builds_near_target(details, target_value, target_type, num_builds=5):
    """
    Returns the `num_builds` builds whose metric is closest to `target_value`.

    Args:
        details (list): Build dicts, each with total_damage, total_cost, net_cost pre-computed.
        target_value (float): The value to match against.
        target_type (str): One of 'cost_per_k', 'total_damage', 'net_cost'.
        num_builds (int): How many builds to return.

    Returns:
        list: Up to `num_builds` builds sorted by proximity to target_value.
    """
    def get_metric(d):
        if target_type == 'cost_per_k':
            return (d['net_cost'] / d['total_damage'] * 1000) if d['total_damage'] > 0 else float('inf')
        elif target_type == 'total_damage':
            return d['total_damage']
        elif target_type == 'net_cost':
            return d['net_cost']
        return 0

    scored = sorted(details, key=lambda d: abs(get_metric(d) - target_value))
    return scored[:num_builds]
