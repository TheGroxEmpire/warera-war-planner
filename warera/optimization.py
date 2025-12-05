import numpy as np
from pymoo.core.problem import Problem
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.optimize import minimize
from pymoo.termination import get_termination
from .config import MAX_SKILL_LEVEL, WEAPON_TIERS, GEAR_TIERS, GEAR_SLOTS, AMMO_NAMES, FOOD_NAMES, SKILL_LEVEL_COST, SKILL_POINTS_PER_LEVEL
from .model import compute_totals
from multiprocessing import Pool
import os

# =========================================
# OPTIMIZATION PROBLEM (NSGA-II)
# =========================================
class BuildProblem(Problem):
    def __init__(self, level, dodge_build=False, disinformation_mode=False):
        n_vars = 16
        xl = np.array([0]*8 + [0]*6 + [0] + [0])
        if dodge_build:
            xl[5] = 7  # Dodge skill at least 7
            
        xu = np.array(
            [MAX_SKILL_LEVEL]*8 +
            [len(WEAPON_TIERS)-1] +                    # weapon slot
            [len(GEAR_TIERS)-1] * (len(GEAR_SLOTS)-1) +  # rest of gear
            [len(AMMO_NAMES)-1] +
            [len(FOOD_NAMES)-1]
        )

        n_constr = 3 if dodge_build else 2
        super().__init__(n_var=n_vars, n_obj=2, n_constr=n_constr, xl=xl, xu=xu)
        self.level = level
        self.skill_points = int(level * SKILL_POINTS_PER_LEVEL)
        self.dodge_build = dodge_build
        self.disinformation_mode = disinformation_mode

    def _evaluate(self, X, out, *args, **kwargs):
        F = []
        G = []
        for row in X:
            row = np.round(row).astype(int)
            skill_lvls = row[:8]
            gear_idx   = row[8:14]
            ammo_idx   = row[14]
            food_idx   = row[15]

            # ---- Skill point budget constraint
            skill_cost = int(np.sum(SKILL_LEVEL_COST[skill_lvls]))
            g1 = skill_cost - self.skill_points

            # ---- Ammo constraint
            weapon_tier = WEAPON_TIERS[int(gear_idx[0])]
            ammo_name = AMMO_NAMES[int(ammo_idx)]

            # invalid if mismatch between weapon/ammo logic
            if (weapon_tier in ["none", "knife"] and ammo_name != "none") or \
           (weapon_tier not in ["none", "knife"] and ammo_name == "none"):
                g2 = 1
            else:
                g2 = 0

            constraints = [g1, g2]
            
            # --- Dodge build constraint ---
            if self.dodge_build:
                boots_tier_idx = gear_idx[5]
                purple_tier_idx = GEAR_TIERS.index("purple")
                if boots_tier_idx < purple_tier_idx:
                    g3 = 1
                else:
                    g3 = 0
                constraints.append(g3)


            total_damage, total_cost, diag = compute_totals(skill_lvls, gear_idx, ammo_idx, food_idx)

            F.append([-total_damage, total_cost])
            G.append(constraints)

        out["F"] = np.array(F, dtype=float)
        out["G"] = np.array(G, dtype=float)

def optimize_worker(args):
    level, dodge_build, disinformation_mode = args
    problem = BuildProblem(level, dodge_build, disinformation_mode)
    if disinformation_mode:
        pop_size = 40
        n_gen = 2
    else:
        pop_size = int(os.environ.get("POP_SIZE", 100))
        n_gen = int(os.environ.get("N_GEN", 50))
    algorithm = NSGA2(pop_size=pop_size)
    termination = get_termination("n_gen", n_gen)
    res = minimize(problem, algorithm, termination, seed=1, verbose=False)
    return res

def optimize(level, dodge_build=False, verbose=True, disinformation_mode=False):
    pool_size = int(os.environ.get("POOL_SIZE", 1))
    with Pool(pool_size) as p:
        results = p.map(optimize_worker, [(level, dodge_build, disinformation_mode)] * pool_size)
    
    best_res = None
    for res in results:
        if res.F is not None and (best_res is None or best_res.F is None or res.F.max() > best_res.F.max()):
            best_res = res
            
    return best_res
