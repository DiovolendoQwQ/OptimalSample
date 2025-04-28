#!/usr/bin/env python3
"""
optimal_samples_selection.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
后端核心算法 + API 服务
==========================
- **select_optimal_samples()**: 纯函数，可被任何前端（CLI、Electron、Qt、React、Android…）直接调用。
- **/select**: FastAPI JSON 接口，前端（Axios／fetch）POST 参数即可获得结果。
- **CLI**: `python optimal_samples_selection.py --help` 保留命令行单测/运维能力。
- **DB**: 结果自动写入 `results.sqlite3`；通过 `/results/{id}` 查询或 DELETE。

依赖安装
---------
```bash
pip install fastapi uvicorn[standard] ortools numpy sqlalchemy
```
"""
from __future__ import annotations

import argparse
import itertools  # Removed sqlite3, pathlib
import json
import logging
import os
import random
import sys
import time
import warnings
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from ortools.sat.python import cp_model  # 高性能 0‑1 MIP

try:
    import psutil  # For CPU core count detection
except ImportError:
    psutil = None
    print(
        "Warning: psutil not installed. Cannot automatically determine optimal workers.",
        file=sys.stderr,
    )

from fastapi import FastAPI, HTTPException, Request  # Add Request
from pydantic import BaseModel

# Import pruning utility
try:
    from utils.combo_prune import unique_k_combos
except ImportError:
    # Fallback if utils is not in the path during direct execution
    print(
        "Warning: Could not import unique_k_combos from utils. Pruning disabled.",
        file=sys.stderr,
    )
    unique_k_combos = None

########################
#  核心算法（最小阈值覆盖） #
########################


def _threshold_set_cover(
    combos: List[Tuple[int, ...]],
    j_subsets: List[Tuple[int, ...]],
    t: int,
    workers: int,  # workers now required, determined in select_optimal_samples
    time_limit: Optional[int] = None,
    progress_callback=None,
    start_time: Optional[float] = None,  # 添加 start_time 参数
    warm_start_hints: Optional[
        List[Tuple[int, ...]]
    ] = None,  # Add warm start parameter
) -> List[Tuple[int, ...]]:
    """OR‑Tools CP‑SAT exactly minimise combinations under threshold t. Supports warm start."""
    print(
        f"Running _threshold_set_cover with {len(combos)} k-combinations, {len(j_subsets)} j-subsets, t={t}, workers={workers}, warm_start={'Yes' if warm_start_hints else 'No'}",
        file=sys.stderr,
    )

    # 报告初始进度
    report_progress(0, "初始化求解模型...", start_time, progress_callback)  # 使用 start_time

    model = cp_model.CpModel()
    x = [model.NewBoolVar(f"x_{i}") for i in range(len(combos))]

    # 稀疏行：预先构建索引列表，提升内存利用率
    j_to_cols: List[List[int]] = []

    # 获取j-子集的大小
    j_size = len(j_subsets[0]) if j_subsets else 0
    s_size = j_size  # 默认s=j，如果需要s<j的情况，调用者需要预先处理

    combo_sets = [set(itertools.combinations(c, s_size)) for c in combos]

    for js in j_subsets:
        needs = []
        st_js = set(itertools.combinations(js, s_size))
        for idx, covered in enumerate(combo_sets):
            # 组合 c 能贡献多少 s‑子集给此 j‑子集？用 1/0 表示，阈值 t≥1 时只需知道是否覆盖至少 1
            if not covered.isdisjoint(st_js):
                needs.append(idx)
        if not needs:
            raise ValueError("无法覆盖所有 j‑子集，参数不合法")
        j_to_cols.append(needs)

    # 约束：每个j-子集至少被t个k-组合覆盖
    for needs in j_to_cols:
        model.Add(sum(x[i] for i in needs) >= t)

    # 目标：最小化选中的k-组合数量
    model.Minimize(sum(x))

    # 对称破除约束 (Symmetry Breaking)
    # 假设 combos 是按某种标准排序的 (itertools.combinations 默认按字典序)
    # 要求选中的变量索引是单调非增的，有助于减少搜索空间
    for i in range(1, len(x)):
        model.Add(x[i - 1] >= x[i])
    print("Added symmetry breaking constraints.", file=sys.stderr)

    # 设置求解参数
    solver = cp_model.CpSolver()  # Instantiate solver earlier

    # Set time limit (apply default if time_limit is None or 0)
    effective_time_limit = (
        time_limit if time_limit and time_limit > 0 else 30
    )  # Default 30s if not provided or invalid
    solver.parameters.max_time_in_seconds = effective_time_limit
    print(f"Solver: Setting time limit to {effective_time_limit}s", file=sys.stderr)

    # Set number of workers (already determined)
    solver.parameters.num_search_workers = workers  # Set on solver instance
    # solver.parameters.log_search_progress = True # Optional: Enable for detailed debugging

    # Apply warm start hints if provided
    if warm_start_hints:
        print(f"Applying {len(warm_start_hints)} warm start hints...", file=sys.stderr)
        warm_start_set = set(warm_start_hints)
        hints_applied = 0
        for i, combo in enumerate(combos):
            if combo in warm_start_set:
                # Hint that this variable should be 1 in the solution
                model.AddHint(x[i], 1)
                hints_applied += 1
        print(f"Applied {hints_applied} hints to the model.", file=sys.stderr)

    # 求解
    print(
        f"Solver: Starting solve with num_search_workers = {workers}", file=sys.stderr
    )  # Log actual workers used

    # 报告进度并开始求解
    report_progress(
        10, "模型构建完成，开始求解（此步骤可能需要较长时间）...", start_time, progress_callback
    )  # 使用 start_time, 更新消息和百分比
    # callback = SolutionCallback() # REMOVED Callback
    # solver.parameters.enumerate_all_solutions = True # REMOVED Enum All
    status = solver.Solve(model)  # REMOVED callback argument

    solver_time = solver.WallTime()
    print(
        f"Solver wall time: {solver_time:.3f} s", file=sys.stderr
    )  # Add solver wall time print

    # 报告求解完成
    report_progress(95, "求解完成，处理结果...", start_time, progress_callback)  # 使用 start_time

    # Optionally print solver stats after solve
    response_stats = solver.ResponseStats()
    print(f"Solver Response Stats:\n{response_stats}", file=sys.stderr)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        status_name = solver.StatusName(status)
        error_message = f"求解失败或超时。状态: {status_name} ({status})"
        print(f"Error: {error_message}", file=sys.stderr)
        raise RuntimeError(error_message)

    # 返回选中的k-组合
    selected = [combos[i] for i, var in enumerate(x) if solver.Value(var)]
    print(f"Found optimal solution with {len(selected)} combinations", file=sys.stderr)
    return selected


# Import bitmask utility
try:
    from utils.bitmask import generate_masks
except ImportError:
    print(
        "Warning: Could not import generate_masks from utils. Bitmask optimization disabled for greedy.",
        file=sys.stderr,
    )
    generate_masks = None


# 处理s<j的情况的贪心算法
def _greedy_cover_partial(
    samples: List[int],
    k_combos: List[
        Tuple[int, ...]
    ],  # Note: k_combos might be pruned if s==j, but greedy is only called if s<j
    j: int,
    s: int,
    start_time: float,  # 添加 start_time 参数
    progress_callback=None,
    use_bitmask: bool = True,  # Add flag to enable/disable bitmask optimization
    beam_width: int = 1,  # Add beam_width parameter
) -> List[Tuple[int, ...]]:
    """贪心算法处理s<j的情况，确保每个j-子集中至少有一个s-子集被覆盖。包含 Beam Search 选项和 2-Opt 优化。"""  # Updated docstring
    n_samples = len(samples)
    print(
        f"Running greedy_cover_partial (s<j case): n={n_samples}, j={j}, s={s}, use_bitmask={use_bitmask}, beam_width={beam_width}",
        file=sys.stderr,
    )

    actual_use_bitmask = use_bitmask and generate_masks is not None
    if use_bitmask and not actual_use_bitmask:
        print(
            "Warning: Bitmask requested but utility not loaded. Falling back to set logic.",
            file=sys.stderr,
        )

    if report_progress:
        report_progress(
            0,
            f"初始化贪心算法 (bitmask {'enabled' if actual_use_bitmask else 'disabled'})...",
            start_time,
            progress_callback,
        )

    all_j_subsets_list = list(itertools.combinations(samples, j))
    num_j_subsets = len(all_j_subsets_list)

    if not num_j_subsets:
        if report_progress:
            report_progress(100, "完成：没有需要处理的j-子集", start_time, progress_callback)
        return []

    # --- Pre-calculate data structures for coverage check ---
    j_subset_internals_sets = {
        js: set(itertools.combinations(js, s)) for js in all_j_subsets_list
    }
    k_combo_s_subsets_sets = {kc: set(itertools.combinations(kc, s)) for kc in k_combos}
    # Create a mapping from k-combo tuple to its original index for efficient lookup
    k_combo_to_index = {combo: i for i, combo in enumerate(k_combos)}

    k_s_coverage_packed = None
    j_s_requirement_packed = None
    if actual_use_bitmask:
        if report_progress:
            report_progress(
                5, "生成 s-子集 (for check func)...", start_time, progress_callback
            )
        s_subsets_per_k = [
            list(k_combo_s_subsets_sets[kc]) for kc in k_combos
        ]  # Reuse calculated sets
        s_subsets_per_j = [
            list(j_subset_internals_sets[js]) for js in all_j_subsets_list
        ]  # Reuse calculated sets

        if report_progress:
            report_progress(
                10, "寻找唯一 s-子集 (for check func)...", start_time, progress_callback
            )
        all_unique_s_subsets_set = (
            set()
            .union(*k_combo_s_subsets_sets.values())
            .union(*j_subset_internals_sets.values())
        )
        # Ensure subsets within the set are tuples for hashability if needed later, though sorting handles consistency
        unique_s_subsets_list = sorted(
            [tuple(sorted(sub)) for sub in all_unique_s_subsets_set]
        )
        s_subset_to_index = {
            subset: i for i, subset in enumerate(unique_s_subsets_list)
        }
        num_unique_s = len(unique_s_subsets_list)

        if report_progress:
            report_progress(
                15,
                f"找到 {num_unique_s} 个唯一 s-子集。生成覆盖矩阵 (for check func)...",
                start_time,
                progress_callback,
            )
        k_s_coverage_bool = np.zeros((len(k_combos), num_unique_s), dtype=bool)
        j_s_requirement_bool = np.zeros((num_j_subsets, num_unique_s), dtype=bool)
        for i, k_subset_list in enumerate(s_subsets_per_k):
            # Ensure subsets used as keys are tuples of sorted elements
            indices = [
                s_subset_to_index.get(tuple(sorted(subset))) for subset in k_subset_list
            ]
            valid_indices = [idx for idx in indices if idx is not None]
            if valid_indices:
                k_s_coverage_bool[i, valid_indices] = True
        for l, j_subset_list in enumerate(s_subsets_per_j):
            # Ensure subsets used as keys are tuples of sorted elements
            indices = [
                s_subset_to_index.get(tuple(sorted(subset))) for subset in j_subset_list
            ]
            valid_indices = [idx for idx in indices if idx is not None]
            if valid_indices:
                j_s_requirement_bool[l, valid_indices] = True

        k_s_coverage_packed = np.packbits(k_s_coverage_bool, axis=1)
        j_s_requirement_packed = np.packbits(j_s_requirement_bool, axis=1)

    # --- Helper function for 2-Opt: Check full coverage ---
    def _check_full_coverage(current_selection_indices: List[int]) -> bool:
        """Checks if the given list of k-combo indices covers all j-subsets."""
        if not current_selection_indices:
            return num_j_subsets == 0  # Empty selection only valid if no j-subsets

        if actual_use_bitmask:
            # Combine masks of selected k_combos
            selected_k_masks = k_s_coverage_packed[current_selection_indices]
            # Use bitwise OR reduction to get the combined coverage mask
            combined_k_coverage = np.bitwise_or.reduce(selected_k_masks, axis=0)
            # Check coverage against j_subset requirements using bitwise AND
            # coverage_check[j, byte] is non-zero if j is covered for that byte range
            coverage_check = np.bitwise_and(j_s_requirement_packed, combined_k_coverage)
            # A j-subset is covered if *any* byte in its row in coverage_check is non-zero
            # We need *all* j-subsets to be covered.
            return np.all(np.any(coverage_check, axis=1))
        else:
            # Set logic coverage check
            selected_combos_for_check = [k_combos[i] for i in current_selection_indices]
            # Calculate the union of all s-subsets covered by the selected k-combos
            overall_covered_s = set().union(
                *(k_combo_s_subsets_sets[combo] for combo in selected_combos_for_check)
            )
            # Check if every j-subset has at least one of its s-subsets present in the overall covered set
            return all(
                not j_subset_internals_sets[js].isdisjoint(overall_covered_s)
                for js in all_j_subsets_list
            )

    # --- Main Greedy Loop ---
    selected_k_indices = []  # Store indices relative to the original k_combos list
    result_combos = []  # Store the actual combo tuples

    if actual_use_bitmask:
        if report_progress:
            report_progress(
                25, "覆盖矩阵已打包。开始贪心迭代 (bitmask)...", start_time, progress_callback
            )
        satisfied_j_mask = np.zeros(num_j_subsets, dtype=bool)
        num_satisfied = 0
        candidate_k_indices = list(range(len(k_combos)))
        iter_count = 0
        while num_satisfied < num_j_subsets and candidate_k_indices:
            # (Bitmask greedy loop logic as implemented before...)
            iter_count += 1
            beam_candidates: List[Tuple[int, int, Optional[np.ndarray]]] = []
            unsatisfied_j_indices = np.where(~satisfied_j_mask)[0]
            if not unsatisfied_j_indices.size:
                break
            unsatisfied_j_req_packed = j_s_requirement_packed[unsatisfied_j_indices]
            for k_idx in candidate_k_indices:
                k_mask_packed = k_s_coverage_packed[k_idx]
                potential_coverage_packed = np.bitwise_and(
                    unsatisfied_j_req_packed, k_mask_packed
                )
                newly_covers_mask_local = np.any(potential_coverage_packed, axis=1)
                count = np.sum(newly_covers_mask_local)
                if count > 0:
                    beam_candidates.append((count, k_idx, newly_covers_mask_local))
            if not beam_candidates:
                print(
                    f"Warning: Greedy iteration {iter_count} couldn't find any improving k-combo.",
                    file=sys.stderr,
                )
                break
            beam_candidates.sort(key=lambda x: x[0], reverse=True)
            best_count, best_k_idx, best_newly_satisfied_mask_local = beam_candidates[0]
            selected_k_indices.append(best_k_idx)
            candidate_k_indices.remove(best_k_idx)
            if best_newly_satisfied_mask_local is not None:
                newly_satisfied_orig_indices = unsatisfied_j_indices[
                    best_newly_satisfied_mask_local
                ]
                satisfied_j_mask[newly_satisfied_orig_indices] = True
                num_satisfied = np.sum(satisfied_j_mask)
            else:
                num_satisfied = np.sum(satisfied_j_mask)
            if report_progress:
                report_progress(
                    30 + int(60 * (num_satisfied / num_j_subsets)),
                    f"迭代 {iter_count}: 选择 K-组合 #{best_k_idx} (新增 {best_count} 满足). 总满足 {num_satisfied}/{num_j_subsets}",
                    start_time,
                    progress_callback,
                )
        result_combos = [
            k_combos[i] for i in selected_k_indices
        ]  # Get combos from indices

    else:  # --- Original Set Logic Path (Fallback) ---
        if report_progress:
            report_progress(
                25, "s-子集计算完成。开始贪心迭代 (set logic)...", start_time, progress_callback
            )
        satisfied_j_subsets_set = set()
        all_j_subsets_set = set(all_j_subsets_list)
        candidate_k_combos_set = set(k_combos)
        iter_count = 0
        while len(satisfied_j_subsets_set) < num_j_subsets and candidate_k_combos_set:
            # (Set logic greedy loop as implemented before...)
            iter_count += 1
            beam_candidates_set: List[
                Tuple[int, Tuple[int, ...], Set[Tuple[int, ...]]]
            ] = []
            unsatisfied_j_subsets = all_j_subsets_set - satisfied_j_subsets_set
            if not unsatisfied_j_subsets:
                break
            for k_combo in candidate_k_combos_set:
                count = 0
                newly_satisfied_by_this = set()
                current_k_s_set = k_combo_s_subsets_sets[
                    k_combo
                ]  # Use precalculated set
                for j_subset in unsatisfied_j_subsets:
                    if not j_subset_internals_sets[j_subset].isdisjoint(
                        current_k_s_set
                    ):  # Use precalculated set
                        count += 1
                        newly_satisfied_by_this.add(j_subset)
                if count > 0:
                    beam_candidates_set.append(
                        (count, k_combo, newly_satisfied_by_this)
                    )
            if not beam_candidates_set:
                print(
                    f"Warning: Greedy iteration {iter_count} (set logic) couldn't find any improving k-combo.",
                    file=sys.stderr,
                )
                break
            beam_candidates_set.sort(key=lambda x: x[0], reverse=True)
            (
                best_count,
                best_combo_to_add,
                best_newly_satisfied_set,
            ) = beam_candidates_set[0]
            result_combos.append(best_combo_to_add)  # Add combo directly
            candidate_k_combos_set.remove(best_combo_to_add)
            satisfied_j_subsets_set.update(best_newly_satisfied_set)
            if report_progress:
                report_progress(
                    30 + int(60 * (len(satisfied_j_subsets_set) / num_j_subsets)),
                    f"迭代 {iter_count} (set): 选择 K-组合 (新增 {best_count} 满足). 总满足 {len(satisfied_j_subsets_set)}/{num_j_subsets}",
                    start_time,
                    progress_callback,
                )
        # Need indices for 2-opt check function if using bitmask path inside helper
        selected_k_indices = [k_combo_to_index[c] for c in result_combos]

    # --- Post-processing & 2-Opt ---
    final_num_satisfied = (
        np.sum(satisfied_j_mask) if actual_use_bitmask else len(satisfied_j_subsets_set)
    )
    if final_num_satisfied < num_j_subsets:
        print(
            f"警告：贪心算法主循环未能满足所有 {num_j_subsets} 个j-子集。"
            f"最终满足 {final_num_satisfied} 个。2-Opt 将不执行。",
            file=sys.stderr,
        )
        # Don't run 2-opt if the initial greedy solution is incomplete
    else:
        # --- 2-Opt Improvement Phase ---
        if report_progress:
            report_progress(90, "开始 2-Opt 优化...", start_time, progress_callback)
        print("Starting 2-Opt improvement phase...", file=sys.stderr)

        current_result_indices = selected_k_indices[:]  # Work with indices
        max_2opt_attempts = len(current_result_indices) * 5  # Heuristic
        attempts = 0
        removed_count = 0

        while attempts < max_2opt_attempts and len(current_result_indices) >= 2:
            attempts += 1
            # Randomly pick two distinct indices *from the current result indices*
            idx1_pos, idx2_pos = random.sample(range(len(current_result_indices)), 2)
            k_idx1 = current_result_indices[idx1_pos]
            k_idx2 = current_result_indices[idx2_pos]

            # Create temporary list excluding these two
            temp_indices = [
                idx
                for i, idx in enumerate(current_result_indices)
                if i != idx1_pos and i != idx2_pos
            ]

            # Check if coverage still holds
            if _check_full_coverage(temp_indices):
                # Accept removal
                current_result_indices = temp_indices
                removed_count += 2
                print(
                    f"  2-Opt: Removed pair (indices {k_idx1}, {k_idx2}). New size: {len(current_result_indices)}",
                    file=sys.stderr,
                )
                # Optional: Reset attempts?
            # else: # Debugging
            # print(f"  2-Opt: Removal of ({k_idx1}, {k_idx2}) failed coverage check.", file=sys.stderr)

            if report_progress and attempts % 50 == 0:
                report_progress(
                    90
                    + int(
                        5 * (attempts / max_2opt_attempts)
                    ),  # Simulate progress 90-95%
                    f"2-Opt 尝试 {attempts}/{max_2opt_attempts}, 已移除 {removed_count}...",
                    start_time,
                    progress_callback,
                )

        print(
            f"2-Opt finished after {attempts} attempts. Removed {removed_count} combos. Final size: {len(current_result_indices)}",
            file=sys.stderr,
        )
        # Update result_combos based on final indices
        result_combos = [k_combos[i] for i in current_result_indices]

    # Final summary message after potential 2-opt
    print(
        f"贪心算法 ({'bitmask' if actual_use_bitmask else 'set logic'}, 2-opt {'applied' if final_num_satisfied >= num_j_subsets else 'skipped'}) 完成。找到 {len(result_combos)} 个组合。"
        f"满足了 {final_num_satisfied}/{num_j_subsets} 个j-子集。",
        file=sys.stderr,
    )

    if report_progress:
        report_progress(
            95, "贪心迭代完成", start_time, progress_callback
        )  # Keep final progress at 95

    return result_combos


# 全局进度报告函数
def report_progress(percent, message, start_time=None, progress_callback=None):
    """
    报告算法进度的全局函数

    Args:
        percent: 进度百分比 (0-100)
        message: 进度消息
        start_time: 开始时间（用于计算已运行时间）
        progress_callback: 可选的外部回调函数
    """
    # 计算已运行时间（如果提供了开始时间）
    elapsed_str = ""
    elapsed_time = 0
    if start_time is not None:
        elapsed_time = time.perf_counter() - start_time
        elapsed_str = f"({elapsed_time:.1f}s)"

    # 将进度信息格式化为JSON并打印到标准输出
    progress_data = {
        "type": "progress",
        "percent": percent,
        "message": f"{message} {elapsed_str}",
        "elapsed_time": elapsed_time,
    }
    print(json.dumps(progress_data))  # Corrected indentation
    sys.stdout.flush()  # Corrected indentation, Explicitly flush stdout buffer
    # 如果有外部回调函数，也调用它
    if progress_callback:
        progress_callback(percent, f"{message} {elapsed_str}")


#######################
#  外部可调函数       #
#######################


def select_optimal_samples(
    m: int,
    n: int,
    k: int,
    j: int,
    s: int,
    t: int = 1,
    *,
    samples: Optional[List[int]] = None,
    random_select: bool = False,
    seed: Optional[int] = None,
    time_limit: Optional[int] = 10,  # Default time limit for the *whole* function call
    workers: Optional[int] = None,  # Allow user to override, None means auto-detect
    progress_callback=None,  # 添加进度回调函数
    beam_width: int = 1,  # Add beam_width parameter with default
) -> Dict[str, Any]:
    """
    返回 JSON‑serialisable 结果字典。
    如果提供了progress_callback，将会定期调用它来报告进度。
    progress_callback函数签名: progress_callback(percent: int, message: str)
    """
    # 开始计时
    start_time = time.perf_counter()  # Start timer for the whole function

    # 报告初始进度
    report_progress(0, "验证参数...", start_time, progress_callback)

    # 参数检查
    if not (
        45 <= m <= 54 and 7 <= n <= 25 and 4 <= k <= 7 and 3 <= s <= 7 and s <= j <= k
    ):
        raise ValueError("参数范围错误，详见题目要求")
    if not (1 <= t <= j):  # Add t validation
        raise ValueError(f"t ({t}) 必须满足 1 <= t <= j ({j})")
    if random_select:
        rng = random.Random(seed)
        samples = rng.sample(range(1, m + 1), n)
    if samples is None:
        raise ValueError("必须提供 samples 或使用 random_select")
    if len(samples) != n:
        raise ValueError("samples 长度与 n 不符")
    samples = sorted(samples)

    # Determine number of workers for CP-SAT
    if workers is None or workers <= 0:
        if psutil:
            # Use physical cores * 1.5 as a heuristic, min 1
            auto_workers = max(1, int(psutil.cpu_count(logical=False) * 1.5))
            print(
                f"Auto-detected workers: {auto_workers} (physical cores * 1.5)",
                file=sys.stderr,
            )
        else:
            auto_workers = 4  # Fallback if psutil not available
            print(
                f"Warning: psutil not found. Defaulting workers to {auto_workers}.",
                file=sys.stderr,
            )
        effective_workers = auto_workers
    else:
        effective_workers = workers
        print(f"Using user-specified workers: {effective_workers}", file=sys.stderr)

    # 生成组合
    report_progress(5, "生成组合...", start_time, progress_callback)

    k_combos = list(itertools.combinations(samples, k))
    j_subsets = list(itertools.combinations(samples, j))

    report_progress(
        10,
        f"生成了 {len(k_combos)} 个k-组合和 {len(j_subsets)} 个j-子集",
        start_time,
        progress_callback,
    )

    # 根据s和j的关系选择不同的算法
    if s == j:
        # 当s=j时，进行变量裁剪并使用CP-SAT求解器
        if unique_k_combos:
            report_progress(
                11,
                f"s=j: Pruning k-combinations using s={s} signature...",
                start_time,
                progress_callback,
            )
            original_k_count = len(k_combos)
            k_combos = unique_k_combos(
                samples, k, s
            )  # Prune k_combos based on s-subset signature
            report_progress(
                12,
                f"Pruned k-combinations from {original_k_count} to {len(k_combos)}",
                start_time,
                progress_callback,
            )
        else:
            report_progress(
                11,
                "s=j: Skipping k-combination pruning (utility not loaded).",
                start_time,
                progress_callback,
            )

        print(
            f"s == j: 使用CP-SAT求解器 (workers={effective_workers}, pruned_k_combos={len(k_combos)})",
            file=sys.stderr,
        )  # Log effective workers
        report_progress(15, "使用CP-SAT求解器...", start_time, progress_callback)
        # TODO: Add logic here or in the calling function to fetch warm_start_hints
        warm_start_data = None  # Placeholder
        # 传递 start_time, effective_workers, and warm_start_hints
        combos_selected = _threshold_set_cover(
            k_combos,
            j_subsets,
            t,
            workers=effective_workers,
            time_limit=time_limit,
            progress_callback=progress_callback,
            start_time=start_time,
            warm_start_hints=warm_start_data,
        )
    else:
        # 当s<j时，使用贪心算法
        # Add a parameter to control bitmask usage if needed, e.g., from CLI/API
        use_bitmask_greedy = True  # Or get from params
        # Use the beam_width parameter passed to select_optimal_samples
        beam_width_greedy = (
            beam_width if beam_width >= 1 else 1
        )  # Ensure beam_width is at least 1
        report_progress(
            15,
            f"使用贪心算法 (bitmask {'启用' if use_bitmask_greedy and generate_masks else '禁用'}, beam={beam_width_greedy})...",
            start_time,
            progress_callback,
        )
        # 传递 start_time, bitmask 控制标志, and beam_width
        combos_selected = _greedy_cover_partial(
            samples,
            k_combos,
            j,
            s,
            start_time=start_time,
            progress_callback=progress_callback,
            use_bitmask=use_bitmask_greedy,
            beam_width=beam_width_greedy,
        )

    end_time = time.perf_counter()  # End timer
    execution_time = end_time - start_time

    report_progress(100, "计算完成", start_time, progress_callback)

    # Prepare the final result dictionary
    res = {
        "m": m,
        "n": n,
        "k": k,
        "j": j,
        "s": s,
        "t": t,
        "samples": samples,
        "combos": combos_selected,
        "execution_time": round(execution_time, 3),  # Add execution time in seconds
        "workers": effective_workers,  # Report the actual workers used for CP-SAT
    }

    # Print the final result as a single JSON line to stdout
    print(json.dumps(res, ensure_ascii=False, separators=(",", ":")))  # Compact JSON

    return res  # Return the dictionary as before for potential direct calls


# Database saving is now handled by the Electron main process.
# Removed _DB, _init_db, save_result functions.

################
#  FastAPI APP #
################

app = FastAPI(title="Optimal Samples Selection System")


# Middleware for timing requests
@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    start_api = time.perf_counter()
    response = await call_next(request)
    elapsed_api = time.perf_counter() - start_api
    response.headers["X-Process-Time"] = f"{elapsed_api:.3f}s"
    logging.info(
        f"API Request {request.method} {request.url.path} completed in {elapsed_api:.3f}s"
    )  # Optional logging
    return response


class RequestModel(BaseModel):
    m: int
    n: int
    k: int
    j: int
    s: int
    t: int = 1
    samples: Optional[List[int]] = None
    random_select: bool = False
    seed: Optional[int] = None
    time_limit: Optional[int] = 10
    workers: Optional[int] = 8  # Add optional workers, defaulting to 8


@app.post("/select")
async def api_select(req: RequestModel):
    # Extract workers, providing default if not present or None
    request_params = req.dict()
    workers_to_use = request_params.pop(
        "workers", 8
    )  # Remove workers from dict, use default 8 if missing
    if workers_to_use is None:  # Handle explicit null if pydantic allows
        workers_to_use = 8

    try:
        # Pass remaining params and the processed workers value
        result = select_optimal_samples(**request_params, workers=workers_to_use)

        # Saving is now handled by the main process
        # rid = save_result(result) # REMOVED
        # result["id"] = rid # REMOVED

        return result  # Return result without DB id
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(500, str(e))

        # Reading and deleting results are now handled by the main process
        # Removed /results/{rid} GET and DELETE endpoints
        # @app.get("/results/{rid}")
        # async def api_get_result(rid: int):
        #     _init_db()
        #     with sqlite3.connect(_DB) as conn:
        cur = conn.execute("SELECT params, combos FROM results WHERE id=?", (rid,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "记录不存在")
        params = json.loads(row[0])
        combos = json.loads(row[1])
        return {**params, "combos": combos, "id": rid}


# @app.delete("/results/{rid}")
# async def api_delete_result(rid: int):
#     _init_db()
#     with sqlite3.connect(_DB) as conn:
#         cur = conn.execute("DELETE FROM results WHERE id=?", (rid,))
#         if cur.rowcount == 0:
#             raise HTTPException(404, "记录不存在")
#         return {"deleted": rid}

########################
#  CLI for quick tests #
#  (Note: CLI will no longer save results to DB)
########################


def main():
    p = argparse.ArgumentParser(description="Optimal Samples Selection CLI")
    p.add_argument("-m", type=int, required=True, help="总样本数量 (45 <= m <= 54)")
    p.add_argument("-n", type=int, required=True, help="选择的样本数量 (7 <= n <= 25)")
    p.add_argument("-k", type=int, required=True, help="组合大小 (4 <= k <= 7)")
    p.add_argument("-j", type=int, required=True, help="子集大小 (s <= j <= k)")
    p.add_argument("-s", type=int, required=True, help="内部子集大小 (3 <= s <= 7)")
    p.add_argument("-t", type=int, default=1, help="覆盖阈值 (默认: 1)")
    p.add_argument("--samples", type=str, help='逗号分隔的样本列表 (例如: "1,2,3,4,5,6,7")')
    p.add_argument("--random", action="store_true", help="随机选样")
    p.add_argument("--seed", type=int, help="随机种子")
    p.add_argument(
        "--time", type=int, default=30, help="求解时间限制(秒, 默认 30)"
    )  # Default CLI time limit to 30
    p.add_argument(
        "--workers", type=int, help="求解器使用的 CPU 工作线程数 (默认: 自动检测)"
    )  # Changed help text
    p.add_argument(
        "--beam", type=int, default=1, help="贪心算法 s<j 情况下的 Beam Width (默认: 1)"
    )  # Add beam argument
    args = p.parse_args()

    try:
        # 解析样本列表
        samples_list = None
        if args.samples:
            samples_list = [int(x) for x in args.samples.split(",") if x.strip()]

        # 调用核心函数并计时
        start_cli = time.perf_counter()  # Start timer
        res = select_optimal_samples(
            args.m,
            args.n,
            args.k,
            args.j,
            args.s,
            args.t,
            samples=samples_list,
            random_select=args.random,
            seed=args.seed,
            time_limit=args.time,
            workers=args.workers,  # Pass workers from args
            beam_width=args.beam,  # Pass beam width from args
        )
        # execution_time is now part of the result 'res'

        # 输出JSON结果 (contains execution_time)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        # Print solver time (if any) and overall success message to stderr
        # The main execution time is already in the JSON output.
        # We can still print the original CLI timer for comparison/verification if needed
        # elapsed_cli = time.perf_counter() - start_cli
        # print(f'CLI Measured Runtime: {elapsed_cli:.3f} s', file=sys.stderr)
        print("算法执行成功。", file=sys.stderr)  # Keep success message on stderr

    except ValueError as ve:
        print(f"输入验证错误: {ve}", file=sys.stderr)
        sys.exit(1)  # 验证错误退出码
    except RuntimeError as re:
        print(f"运行时错误: {re}", file=sys.stderr)
        sys.exit(2)  # 运行时错误退出码
    except Exception as e:
        print(f"发生意外错误: {e}", file=sys.stderr)
        sys.exit(3)  # 通用错误退出码


if __name__ == "__main__":
    main()
