import numpy as np
from pymoo.core.problem import Problem
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.optimize import minimize
from pymoo.termination.default import DefaultMultiObjectiveTermination, DefaultSingleObjectiveTermination
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
    def __init__(self, level, rank_bonus=1.0, pill_mode=False, pill_price=0.0, case1_price=0.0, case2_price=0.0, objective="damage"):
        n_vars = 9 + len(GEAR_SLOTS) + 2
        xl = np.zeros(n_vars, dtype=int)
        xu = np.array(
            [MAX_SKILL_LEVEL]*9 +
            [len(WEAPON_TIERS)-1] + [len(GEAR_TIERS)-1] * (len(GEAR_SLOTS) - 1) +
            [len(AMMO_NAMES)-1] +
            [len(FOOD_NAMES)-1]
        )
        super().__init__(n_var=n_vars, n_obj=2, n_constr=2, xl=xl, xu=xu)
        self.skill_points = int(level * SKILL_POINTS_PER_LEVEL)
        self.rank_bonus = rank_bonus
        self.pill_mode = pill_mode
        self.pill_price = pill_price
        self.case1_price = case1_price
        self.case2_price = case2_price
        self.objective = objective
        self._gear_cache = {}

    def _evaluate(self, X, out, *args, **kwargs):
        X = np.round(X).astype(int)
        n_pop = X.shape[0]
        F = np.zeros((n_pop, 2))
        g_skill = np.sum(SKILL_LEVEL_COST[X[:, :9]], axis=1) - self.skill_points
        weapon_idx = X[:, 9]
        ammo_idx   = X[:, 15]
        # weapon none/knife (idx<=1) must use noAmmo (idx==0); gun+ (idx>=2) must use ammo (idx>0)
        g_ammo = np.where(weapon_idx <= 1, ammo_idx.astype(float), (ammo_idx == 0).astype(float))
        G = np.column_stack([g_skill, g_ammo])

        for i in range(n_pop):
            row = X[i]
            g_idx = tuple(row[9:15])
            if g_idx not in self._gear_cache:
                gear_choice = {slot: int(g_idx[j]) for j, slot in enumerate(GEAR_SLOTS)}
                combined_baseline, _ = apply_gear_to_baseline(gear_choice)
                self._gear_cache[g_idx] = make_skill_tables(combined_baseline)

            total_damage, total_cost, diag = compute_totals(
                row[:9], row[9:15], row[15], row[16],
                rank_bonus=self.rank_bonus, pill_mode=self.pill_mode, pill_price=self.pill_price,
                tables=self._gear_cache[g_idx],
            )
            F[i, 0] = -diag['cases_per_day'] if self.objective == "cases" else -total_damage
            F[i, 1] = total_cost - diag['cases_per_day'] * self.case1_price - diag['elite_cases_per_day'] * self.case2_price

        out["F"], out["G"] = F, G.reshape(-1, 1)

# =========================================
# MAX DAMAGE PROBLEM (single-objective GA)
# =========================================
class MaxDamageProblem(Problem):
    """Single-objective problem: maximize damage with best-tier fixed gear."""
    FIXED_GEAR_IDX = [len(WEAPON_TIERS)-1] + [len(GEAR_TIERS)-1] * (len(GEAR_SLOTS) - 1)
    FIXED_AMMO_IDX = len(AMMO_NAMES) - 1
    FIXED_FOOD_IDX = len(FOOD_NAMES) - 1

    def __init__(self, level, rank_bonus=1.0, pill_mode=False, pill_price=0.0):
        xl = np.zeros(9, dtype=int)
        xu = np.full(9, MAX_SKILL_LEVEL, dtype=int)
        super().__init__(n_var=9, n_obj=1, n_ieq_constr=1, xl=xl, xu=xu)
        self.skill_points = int(level * SKILL_POINTS_PER_LEVEL)
        self.rank_bonus = rank_bonus
        self.pill_mode = pill_mode
        self.pill_price = pill_price
        gear_choice = {slot: self.FIXED_GEAR_IDX[j] for j, slot in enumerate(GEAR_SLOTS)}
        combined_baseline, _ = apply_gear_to_baseline(gear_choice)
        self._tables = make_skill_tables(combined_baseline)

    def _evaluate(self, X, out, *args, **kwargs):
        X = np.round(X).astype(int)
        n_pop = X.shape[0]
        F = np.zeros((n_pop, 1))
        G = np.sum(SKILL_LEVEL_COST[X[:, :9]], axis=1) - self.skill_points

        for i in range(n_pop):
            total_damage, _, _ = compute_totals(
                X[i], self.FIXED_GEAR_IDX, self.FIXED_AMMO_IDX, self.FIXED_FOOD_IDX,
                rank_bonus=self.rank_bonus, pill_mode=self.pill_mode, pill_price=self.pill_price,
                tables=self._tables
            )
            F[i, 0] = -total_damage

        out["F"], out["G"] = F, G.reshape(-1, 1)


def optimize_max_damage(level, rank_bonus=1.0, pill_mode=False, pill_price=0.0):
    """Run a focused single-objective optimization to find the max-damage build."""
    problem = MaxDamageProblem(level, rank_bonus=rank_bonus, pill_mode=pill_mode, pill_price=pill_price)
    algorithm = NSGA2(
        pop_size=100,
        sampling=IntegerRandomSampling(),
        crossover=SBX(prob=0.9, eta=15, repair=RoundingRepair()),
        mutation=PM(prob=0.1, eta=20, repair=RoundingRepair()),
        eliminate_duplicates=True
    )
    res = minimize(problem, algorithm, DefaultSingleObjectiveTermination(period=20, n_max_gen=50), seed=42, verbose=False)

    if res.X is None:
        return None

    skill_lvls = np.round(res.X).astype(int) if res.X.ndim == 1 else np.round(res.X[0]).astype(int)
    gear_idx = MaxDamageProblem.FIXED_GEAR_IDX
    ammo_idx = MaxDamageProblem.FIXED_AMMO_IDX
    food_idx = MaxDamageProblem.FIXED_FOOD_IDX
    total_damage, total_cost, diag = compute_totals(
        skill_lvls, gear_idx, ammo_idx, food_idx,
        rank_bonus=rank_bonus, pill_mode=pill_mode, pill_price=pill_price,
        tables=problem._tables
    )
    skill_cost = int(np.sum(SKILL_LEVEL_COST[skill_lvls]))
    return {
        "skill_lvls": skill_lvls.tolist(),
        "gear_idx": list(gear_idx),
        "ammo_idx": ammo_idx,
        "food_idx": food_idx,
        "total_damage": total_damage,
        "total_cost": total_cost,
        "skill_cost": skill_cost,
        "diag": diag,
        "is_max_damage": True,
    }


def optimize_worker(args):
    level, seed, rank_bonus, pill_mode, pill_price, case1_price, case2_price, objective = args
    problem = BuildProblem(level, rank_bonus=rank_bonus, pill_mode=pill_mode, pill_price=pill_price, case1_price=case1_price, case2_price=case2_price, objective=objective)
    pop_size = int(os.environ.get("POP_SIZE", 150))
    n_gen = int(os.environ.get("N_GEN", 80))
    
    algorithm = NSGA2(
        pop_size=pop_size,
        sampling=IntegerRandomSampling(),
        crossover=SBX(prob=0.9, eta=15, repair=RoundingRepair()),
        mutation=PM(prob=0.1, eta=20, repair=RoundingRepair()),
        eliminate_duplicates=True
    )
    res = minimize(problem, algorithm, DefaultMultiObjectiveTermination(n_max_gen=n_gen), seed=seed, verbose=False)
    return res

def optimize(level, verbose=True, rank_bonus=1.20, pill_mode=False, pill_price=0.0, case1_price=0.0, case2_price=0.0, objective="damage"):
    num_runs = int(os.environ.get("NUM_RUNS", 2))
    pool_size = min(num_runs, int(os.environ.get("POOL_SIZE", 1)))
    seeds = np.random.randint(0, 10000, size=num_runs).tolist()
    args = [(level, int(seeds[i]), rank_bonus, pill_mode, pill_price, case1_price, case2_price, objective) for i in range(num_runs)]
    
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
