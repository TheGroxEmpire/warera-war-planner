import numpy as np
from pymoo.core.problem import Problem
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.optimize import minimize
from pymoo.termination import get_termination
from pymoo.operators.sampling.rnd import IntegerRandomSampling
from pymoo.operators.crossover.sbx import SBX
from pymoo.operators.mutation.pm import PM
from pymoo.operators.repair.rounding import RoundingRepair
from .config import MAX_SKILL_LEVEL, WEAPON_TIERS, GEAR_TIERS, GEAR_SLOTS, AMMO_NAMES, FOOD_NAMES, SKILL_LEVEL_COST, SKILL_POINTS_PER_LEVEL
from .model import compute_totals, attacks_possible
from .stats import apply_gear_to_baseline, make_skill_tables
from .config import AMMO, FOOD, GEAR, AMMO_NAMES, FOOD_NAMES, WEAPON_TIERS, GEAR_TIERS
from multiprocessing import Pool
from pymoo.util.nds.non_dominated_sorting import NonDominatedSorting
import os

# =========================================
# OPTIMIZATION PROBLEM (NSGA-II)
# =========================================
class BuildProblem(Problem):
    def __init__(self, level, disinformation_mode=False, rank_bonus=1.0, pill_mode=False):
        n_vars = 8 + len(GEAR_SLOTS) + 2
        xl = np.zeros(n_vars, dtype=int)

        xu = np.array(
            [MAX_SKILL_LEVEL]*8 +
            [len(WEAPON_TIERS)-1] + [len(GEAR_TIERS)-1] * (len(GEAR_SLOTS) - 1) +
            [len(AMMO_NAMES)-1] +
            [len(FOOD_NAMES)-1]
        )

        n_constr = 1
        super().__init__(n_var=n_vars, n_obj=2, n_constr=n_constr, xl=xl, xu=xu)
        self.level = level
        self.skill_points = int(level * SKILL_POINTS_PER_LEVEL)
        self.disinformation_mode = disinformation_mode
        self.rank_bonus = rank_bonus
        self.pill_mode = pill_mode
        self._gear_cache = {}

    def _evaluate(self, X, out, *args, **kwargs):
        X = np.round(X).astype(int)
        n_pop = X.shape[0]
        
        F = np.zeros((n_pop, 2))
        G = np.zeros((n_pop, 1))

        # Vectorized skill costs
        skill_lvls = X[:, :8]
        costs = SKILL_LEVEL_COST[skill_lvls]
        G[:, 0] = np.sum(costs, axis=1) - self.skill_points

        # For performance, we still loop over unique gear/ammo/food combinations if n_pop is large,
        # but since evaluating the model is fast, we'll just loop and optimize the model calls.
        for i in range(n_pop):
            row = X[i]
            s_lvls = row[:8]
            g_idx = row[8:14]
            a_idx = row[14]
            f_idx = row[15]

            # Use cache for gear stats & skill tables
            gear_key = tuple(g_idx)
            if gear_key not in self._gear_cache:
                gear_choice = {slot: int(g_idx[j]) for j, slot in enumerate(GEAR_SLOTS)}
                combined_baseline, _ = apply_gear_to_baseline(gear_choice)
                self._gear_cache[gear_key] = make_skill_tables(combined_baseline)
            
            tables = self._gear_cache[gear_key]
            
            # Picking skill values (fast)
            atk   = tables[0][s_lvls[0]]
            prc   = min(1.0, tables[1][s_lvls[1]])
            critc = min(1.0, tables[2][s_lvls[2]])
            critd = tables[3][s_lvls[3]]
            arm   = min(0.9, tables[4][s_lvls[4]])
            ddg   = tables[5][s_lvls[5]]
            hp    = tables[6][s_lvls[6]]
            hun   = tables[7][s_lvls[7]]

            ammo_name = AMMO_NAMES[a_idx]
            food_name = FOOD_NAMES[f_idx]
            ammo = AMMO[ammo_name]
            food = FOOD[food_name]

            # Re-using logic from model.py but localized for speed
            pill_bonus = 1.6 if self.pill_mode else 1.0
            atk *= (1.0 + ammo["dmg_bonus"]) * self.rank_bonus * pill_bonus
            dmg_per_attack = atk * prc * (1 + critc * critd) + (atk / 2.0) * (1 - prc)
            n_attacks = attacks_possible(hp, hun, arm, ddg, food["regen_bonus"])

            gear_cost_total = 0.0
            for j, slot in enumerate(GEAR_SLOTS):
                t_idx = g_idx[j]
                tier = WEAPON_TIERS[t_idx] if slot == "weapon" else GEAR_TIERS[t_idx]
                gear_item = GEAR[slot][tier]
                decay = 1 if slot == "weapon" else (1 - ddg)
                gear_cost_total += (gear_item["cost"] / 100) * n_attacks * decay

            day_multiplier = 1.7 if self.pill_mode else 2.4
            total_cost = gear_cost_total + (food["cost"] * hun * day_multiplier) + (ammo["bullet_cost"] * n_attacks)
            total_damage = dmg_per_attack * n_attacks

            F[i, 0] = -total_damage
            F[i, 1] = total_cost

        # Periodically clear cache if it gets too large (> 1000 entries)
        if len(self._gear_cache) > 1000:
            self._gear_cache.clear()

        out["F"] = F
        out["G"] = G

def optimize_worker(args):
    level, disinformation_mode, seed, rank_bonus, pill_mode = args
    problem = BuildProblem(level, disinformation_mode, rank_bonus=rank_bonus, pill_mode=pill_mode)
    
    if disinformation_mode:
        pop_size = 40
        n_gen = 5
        algorithm = NSGA2(pop_size=pop_size)
    else:
        # High reliability settings
        # Reduced defaults for free tier to prevent timeouts and OOM
        pop_size = int(os.environ.get("POP_SIZE", 200))
        n_gen = int(os.environ.get("N_GEN", 50))
        
        algorithm = NSGA2(
            pop_size=pop_size,
            sampling=IntegerRandomSampling(),
            crossover=SBX(prob=0.9, eta=15, repair=RoundingRepair()),
            mutation=PM(prob=0.1, eta=20, repair=RoundingRepair()),
            eliminate_duplicates=True
        )
        
    termination = get_termination("n_gen", n_gen)
    
    res = minimize(
        problem, 
        algorithm, 
        termination, 
        seed=seed, 
        verbose=False,
        save_history=False
    )
    return res

def optimize(level, verbose=True, disinformation_mode=False, rank_bonus=1.45, pill_mode=False):
    # Reliability improvement: Multi-start with different seeds and merging results
    num_runs = int(os.environ.get("NUM_RUNS", 2))
    pool_size = min(num_runs, int(os.environ.get("POOL_SIZE", 1)))
    
    seeds = np.random.randint(0, 10000, size=num_runs).tolist()
    args = [(level, disinformation_mode, int(seeds[i]), rank_bonus, pill_mode) for i in range(num_runs)]
    
    if pool_size > 1:
        with Pool(pool_size) as p:
            results = p.map(optimize_worker, args)
    else:
        results = [optimize_worker(arg) for arg in args]
    
    # Merge results and find the combined non-dominated set
    all_X = []
    all_F = []
    
    for res in results:
        if res.X is not None:
            all_X.append(res.X)
            all_F.append(res.F)
    
    if not all_X:
        return results[0]

    X_combined = np.vstack(all_X)
    F_combined = np.vstack(all_F)
    
    # Remove duplicates
    _, unique_idx = np.unique(X_combined, axis=0, return_index=True)
    X_combined = X_combined[unique_idx]
    F_combined = F_combined[unique_idx]
    
    # Perform Non-Dominated Sorting to get the true Pareto front from all runs
    nds = NonDominatedSorting()
    fronts = nds.do(F_combined)
    first_front = fronts[0]
    
    best_res = results[0]
    best_res.X = X_combined[first_front]
    best_res.F = F_combined[first_front]
            
    return best_res
