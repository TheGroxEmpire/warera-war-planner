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
from .model import compute_totals
from .stats import apply_gear_to_baseline, make_skill_tables
from multiprocessing import Pool
from pymoo.util.nds.non_dominated_sorting import NonDominatedSorting
import os

# =========================================
# OPTIMIZATION PROBLEM (NSGA-II)
# =========================================
class BuildProblem(Problem):
    def __init__(self, level, rank_bonus=1.0, pill_mode=False):
        n_vars = 8 + len(GEAR_SLOTS) + 2
        xl = np.zeros(n_vars, dtype=int)
        xu = np.array(
            [MAX_SKILL_LEVEL]*8 +
            [len(WEAPON_TIERS)-1] + [len(GEAR_TIERS)-1] * (len(GEAR_SLOTS) - 1) +
            [len(AMMO_NAMES)-1] +
            [len(FOOD_NAMES)-1]
        )
        super().__init__(n_var=n_vars, n_obj=2, n_constr=1, xl=xl, xu=xu)
        self.skill_points = int(level * SKILL_POINTS_PER_LEVEL)
        self.rank_bonus = rank_bonus
        self.pill_mode = pill_mode
        self._gear_cache = {}

    def _evaluate(self, X, out, *args, **kwargs):
        X = np.round(X).astype(int)
        n_pop = X.shape[0]
        F = np.zeros((n_pop, 2))
        G = np.sum(SKILL_LEVEL_COST[X[:, :8]], axis=1) - self.skill_points

        for i in range(n_pop):
            row = X[i]
            g_idx = tuple(row[8:14])
            if g_idx not in self._gear_cache:
                gear_choice = {slot: int(g_idx[j]) for j, slot in enumerate(GEAR_SLOTS)}
                combined_baseline, _ = apply_gear_to_baseline(gear_choice)
                self._gear_cache[g_idx] = make_skill_tables(combined_baseline)
            
            total_damage, total_cost, _ = compute_totals(
                row[:8], row[8:14], row[14], row[15], 
                rank_bonus=self.rank_bonus, pill_mode=self.pill_mode, 
                tables=self._gear_cache[g_idx]
            )
            F[i, 0] = -total_damage
            F[i, 1] = total_cost

        if len(self._gear_cache) > 1000:
            self._gear_cache.clear()
        out["F"], out["G"] = F, G.reshape(-1, 1)

def optimize_worker(args):
    level, seed, rank_bonus, pill_mode = args
    problem = BuildProblem(level, rank_bonus=rank_bonus, pill_mode=pill_mode)
    pop_size = int(os.environ.get("POP_SIZE", 200))
    n_gen = int(os.environ.get("N_GEN", 50))
    
    algorithm = NSGA2(
        pop_size=pop_size,
        sampling=IntegerRandomSampling(),
        crossover=SBX(prob=0.9, eta=15, repair=RoundingRepair()),
        mutation=PM(prob=0.1, eta=20, repair=RoundingRepair()),
        eliminate_duplicates=True
    )
    res = minimize(problem, algorithm, get_termination("n_gen", n_gen), seed=seed, verbose=False)
    return res

def optimize(level, verbose=True, rank_bonus=1.20, pill_mode=False):
    num_runs = int(os.environ.get("NUM_RUNS", 2))
    pool_size = min(num_runs, int(os.environ.get("POOL_SIZE", 1)))
    seeds = np.random.randint(0, 10000, size=num_runs).tolist()
    args = [(level, int(seeds[i]), rank_bonus, pill_mode) for i in range(num_runs)]
    
    results = [optimize_worker(arg) for arg in args] if pool_size <= 1 else Pool(pool_size).map(optimize_worker, args)
    
    all_X = [res.X for res in results if res.X is not None]
    all_F = [res.F for res in results if res.F is not None]
    if not all_X: return results[0]

    X_combined, F_combined = np.vstack(all_X), np.vstack(all_F)
    _, unique_idx = np.unique(X_combined, axis=0, return_index=True)
    X_combined, F_combined = X_combined[unique_idx], F_combined[unique_idx]
    
    best_idx = NonDominatedSorting().do(F_combined)[0]
    best_res = results[0]
    best_res.X, best_res.F = X_combined[best_idx], F_combined[best_idx]
    return best_res
