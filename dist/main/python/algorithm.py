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
import itertools, random, json, sys, warnings, sqlite3, argparse, time, logging
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional

import numpy as np
from ortools.sat.python import cp_model  # 高性能 0‑1 MIP
from fastapi import FastAPI, HTTPException, Request # Add Request
from pydantic import BaseModel

########################
#  核心算法（最小阈值覆盖） #
########################

def _threshold_set_cover(
    combos: List[Tuple[int, ...]],
    j_subsets: List[Tuple[int, ...]],
    t: int,
    time_limit: Optional[int] = None,
    workers: int = 8,
    progress_callback=None,
    start_time: Optional[float] = None, # 添加 start_time 参数
) -> List[Tuple[int, ...]]:
    """OR‑Tools CP‑SAT exactly minimise combinations under threshold t."""
    print(f"Running _threshold_set_cover with {len(combos)} k-combinations, {len(j_subsets)} j-subsets, t={t}", file=sys.stderr)
    
    # 报告初始进度
    report_progress(0, "初始化求解模型...", start_time, progress_callback) # 使用 start_time
    
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
    
    # 设置求解参数
    solver = cp_model.CpSolver() # Instantiate solver earlier
    if time_limit:
        solver.parameters.max_time_in_seconds = time_limit # Set on solver instance
    solver.parameters.num_search_workers = workers # Set on solver instance
    # solver.parameters.log_search_progress = True # Disable detailed solver logs for normal use
    
    # 求解
    print(f"Solver: Starting solve with num_search_workers = {solver.parameters.num_search_workers}", file=sys.stderr) # Log actual workers used
    
    # 报告进度并开始求解 (改为 10%)
    report_progress(10, "模型构建完成，开始求解（此步骤可能需要较长时间）...", start_time, progress_callback) # 使用 start_time, 更新消息和百分比
    # callback = SolutionCallback() # REMOVED Callback
    # solver.parameters.enumerate_all_solutions = True # REMOVED Enum All
    status = solver.Solve(model) # REMOVED callback argument
    
    solver_time = solver.WallTime()
    print(f'Solver wall time: {solver_time:.3f} s', file=sys.stderr) # Add solver wall time print
    
    # 报告求解完成
    report_progress(95, "求解完成，处理结果...", start_time, progress_callback) # 使用 start_time

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        status_name = solver.StatusName(status)
        error_message = f"求解失败或超时。状态: {status_name} ({status})"
        print(f"Error: {error_message}", file=sys.stderr)
        # 尝试获取更多求解器日志信息 (如果可用)
        # response = solver.ResponseStats()
        # print(f"Solver Response: {response}", file=sys.stderr)
        raise RuntimeError(error_message)

    # 返回选中的k-组合
    selected = [combos[i] for i, var in enumerate(x) if solver.Value(var)]
    print(f"Found optimal solution with {len(selected)} combinations", file=sys.stderr)
    return selected

# 处理s<j的情况的贪心算法
def _greedy_cover_partial(
    samples: List[int],
    k_combos: List[Tuple[int, ...]],
    j: int,
    s: int,
    start_time: float, # 添加 start_time 参数
    progress_callback=None,
) -> List[Tuple[int, ...]]:
    """贪心算法处理s<j的情况，确保每个j-子集中至少有一个s-子集被覆盖。"""
    print(f"Running greedy_cover_partial (s<j case): n={len(samples)}, j={j}, s={s}", file=sys.stderr)
    
    # 报告初始进度
    # 检查 report_progress 是否可用
    if 'report_progress' in globals():
        report_progress(0, "初始化贪心算法...", start_time, progress_callback)
    else:
        print("Warning: report_progress function not found", file=sys.stderr)


    all_j_subsets = set(itertools.combinations(samples, j))
    if not all_j_subsets:
        if 'report_progress' in globals():
            report_progress(100, "完成：没有需要处理的j-子集", start_time, progress_callback)
        return []

    # 为每个j-子集存储其所有s-子集，提高查找效率
    j_subset_internals = {}
    total_j_subsets = len(all_j_subsets) # Get total count for progress calculation
    # Remove inner loop reporting for j-subsets, just keep start/end points
    if 'report_progress' in globals(): # Corrected indentation
        report_progress(5, f"开始预计算 {total_j_subsets} 个 j-子集的内部s-子集...", start_time, progress_callback) 

    j_subset_internals = {js: set(itertools.combinations(js, s)) for js in all_j_subsets} # Calculate all at once

    if 'report_progress' in globals(): # Corrected indentation
        report_progress(10, "j-子集内部s-子集预计算完成", start_time, progress_callback) 

    result = []  # 选中的k-组合
    satisfied_j_subsets = set()  # 已满足条件的j-子集
    
    # 预计算每个k-组合包含的s-子集
    k_combo_s_subsets = {}
    # Remove inner loop reporting for k-combos, just keep start/end points
    total_k_combos = len(k_combos)
    if 'report_progress' in globals(): # Corrected indentation
        report_progress(15, f"开始预计算 {total_k_combos} 个 k-组合的s-子集...", start_time, progress_callback) # Changed percentage to 15%
        
    k_combo_s_subsets = {kc: set(itertools.combinations(kc, s)) for kc in k_combos} # Calculate all at once

    if 'report_progress' in globals(): # Corrected indentation
        report_progress(20, "k-组合s-子集预计算完成", start_time, progress_callback) # Kept 20% end point

    # 贪心迭代开始 (改为 30%)
    if 'report_progress' in globals():
        report_progress(30, "开始贪心迭代选择...", start_time, progress_callback) # Ensuring 8 spaces inside if

    # 当前已覆盖的所有s-子集 (Correct indentation: 4 spaces)
    covered_s_subsets_overall = set() # Correct indentation: 4 spaces

    total_iterations = len(all_j_subsets) # Correct indentation: 4 spaces
    while len(satisfied_j_subsets) < len(all_j_subsets): # Correct indentation: 4 spaces
        best_combo_to_add = None
        max_newly_satisfied_count = -1

        # 找出能满足最多未满足j-子集的k-组合
        for k_combo in k_combos:
            count_satisfied_by_this_k = 0
            current_k_s_subsets = k_combo_s_subsets[k_combo]

            # 检查每个未满足的j-子集
            for j_subset in all_j_subsets:
                if j_subset not in satisfied_j_subsets:
                    # 如果j-子集的任一s-子集被当前k-组合覆盖，则该j-子集被满足
                    if not j_subset_internals[j_subset].isdisjoint(current_k_s_subsets):
                        count_satisfied_by_this_k += 1
            
            # 更新最佳选择
            if count_satisfied_by_this_k > max_newly_satisfied_count:
                max_newly_satisfied_count = count_satisfied_by_this_k
                best_combo_to_add = k_combo

        # 如果没有k-组合能满足更多j-子集，则退出
        if best_combo_to_add is None or max_newly_satisfied_count == 0:
            if len(satisfied_j_subsets) < len(all_j_subsets):
                print(f"警告：无法满足所有 {len(all_j_subsets)} 个j-子集。"
                      f"剩余 {len(all_j_subsets) - len(satisfied_j_subsets)} 个未满足。返回部分结果。", file=sys.stderr)
            break

        # 添加最佳k-组合到结果中
        result.append(best_combo_to_add)
        
        # 更新已覆盖的s-子集
        newly_added_s_subsets = k_combo_s_subsets[best_combo_to_add]
        covered_s_subsets_overall.update(newly_added_s_subsets)
        
        # 报告进度 (固定为 60%，只更新消息)
        if 'report_progress' in globals(): # Corrected indentation
            report_progress(60, f"计算中：已选择 {len(result)} 个组合，满足 {len(satisfied_j_subsets)}/{len(all_j_subsets)} 个j-子集...", start_time, progress_callback) # Fixed percentage


        # 重新评估哪些j-子集现在已满足
        newly_satisfied = set()
        for j_subset in all_j_subsets:
            if j_subset not in satisfied_j_subsets:
                # 检查j-子集的任一s-子集是否在累积覆盖集中
                if not j_subset_internals[j_subset].isdisjoint(covered_s_subsets_overall):
                    newly_satisfied.add(j_subset)
        
        satisfied_j_subsets.update(newly_satisfied)

    print(f"贪心算法完成。找到 {len(result)} 个组合。"
          f"满足了 {len(satisfied_j_subsets)}/{len(all_j_subsets)} 个j-子集。", file=sys.stderr)
     
    # 报告贪心结束 (改为 95%)
    if 'report_progress' in globals(): # Corrected indentation
        report_progress(95, "贪心迭代完成", start_time, progress_callback) # Changed percentage to 95%
    
    return result

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
         "elapsed_time": elapsed_time
    }
    print(json.dumps(progress_data)) # Corrected indentation
    sys.stdout.flush() # Corrected indentation, Explicitly flush stdout buffer
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
    time_limit: Optional[int] = 10,
    workers: int = 8, # Add workers parameter
    progress_callback=None, # 添加进度回调函数
) -> Dict[str, Any]:
    """
    返回 JSON‑serialisable 结果字典。
    如果提供了progress_callback，将会定期调用它来报告进度。
    progress_callback函数签名: progress_callback(percent: int, message: str)
    """
    # 开始计时
    start_time = time.perf_counter() # Start timer for the whole function
    
    # 报告初始进度
    report_progress(0, "验证参数...", start_time, progress_callback)
    
    # 参数检查
    if not (45 <= m <= 54 and 7 <= n <= 25 and 4 <= k <= 7 and 3 <= s <= 7 and s <= j <= k):
        raise ValueError("参数范围错误，详见题目要求")
    if not (1 <= t <= j): # Add t validation
        raise ValueError(f"t ({t}) 必须满足 1 <= t <= j ({j})")
    if random_select:
        rng = random.Random(seed)
        samples = rng.sample(range(1, m + 1), n)
    if samples is None:
        raise ValueError("必须提供 samples 或使用 random_select")
    if len(samples) != n:
        raise ValueError("samples 长度与 n 不符")
    samples = sorted(samples)

    # 生成组合
    report_progress(5, "生成组合...", start_time, progress_callback)
    
    k_combos = list(itertools.combinations(samples, k))
    j_subsets = list(itertools.combinations(samples, j))
    
    report_progress(10, f"生成了 {len(k_combos)} 个k-组合和 {len(j_subsets)} 个j-子集", start_time, progress_callback)


    # 根据s和j的关系选择不同的算法
    if s == j:
        # 当s=j时，使用CP-SAT求解器
        print(f"s == j: 使用CP-SAT求解器 (workers={workers})", file=sys.stderr) # Log workers
        report_progress(15, "使用CP-SAT求解器...", start_time, progress_callback)
        # 传递 start_time
        combos_selected = _threshold_set_cover(k_combos, j_subsets, t, time_limit=time_limit, workers=workers, progress_callback=progress_callback, start_time=start_time)
    else:
        # 当s<j时，使用贪心算法 (Note: greedy doesn't use workers, but we keep the param consistent)
        print(f"s < j: 使用贪心算法", file=sys.stderr)
        report_progress(15, "使用贪心算法...", start_time, progress_callback)
        # 传递 start_time
        combos_selected = _greedy_cover_partial(samples, k_combos, j, s, start_time=start_time, progress_callback=progress_callback)

    end_time = time.perf_counter() # End timer
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
        "execution_time": round(execution_time, 3), # Add execution time in seconds
        "workers": workers, # Include workers used in result
    }
    
    # Print the final result as a single JSON line to stdout
    print(json.dumps(res, ensure_ascii=False, separators=(',', ':'))) # Compact JSON

    return res # Return the dictionary as before for potential direct calls

###################
#  SQLite 简存储  #
###################
_DB = Path("results.sqlite3")

def _init_db():
    with sqlite3.connect(_DB) as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS results(
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   params TEXT NOT NULL,
                   combos TEXT NOT NULL,
                   created TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"""
        )

# Keys to exclude from the 'params' JSON blob in the database
_PARAMS_EXCLUDE_KEYS = {"combos", "execution_time", "workers", "id"}

def save_result(record: Dict[str, Any]) -> int:
    """Saves the result record to the database, excluding runtime details from params JSON."""
    _init_db()
    params_to_save = {k: record[k] for k in record if k not in _PARAMS_EXCLUDE_KEYS}
    combos_to_save = record.get("combos", []) # Use .get for safety

    with sqlite3.connect(_DB) as conn:
        cur = conn.execute(
            "INSERT INTO results(params, combos) VALUES (?, ?)",
            (json.dumps(params_to_save), json.dumps(combos_to_save)),
        )
        # Ensure lastrowid is not None before returning
        last_id = cur.lastrowid
        if last_id is None:
             # This case is unlikely with AUTOINCREMENT but good practice
             raise RuntimeError("Failed to get last inserted row ID from database.")
        return last_id

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
    logging.info(f"API Request {request.method} {request.url.path} completed in {elapsed_api:.3f}s") # Optional logging
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
    workers: Optional[int] = 8 # Add optional workers, defaulting to 8

@app.post("/select")
async def api_select(req: RequestModel):
    # Extract workers, providing default if not present or None
    request_params = req.dict()
    workers_to_use = request_params.pop('workers', 8) # Remove workers from dict, use default 8 if missing
    if workers_to_use is None: # Handle explicit null if pydantic allows
        workers_to_use = 8

    try:
        # Pass remaining params and the processed workers value
        result = select_optimal_samples(**request_params, workers=workers_to_use)

        # Call the updated save_result function which handles filtering internally
        rid = save_result(result)

        result["id"] = rid # Add id back to the full result being returned
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(500, str(e))

@app.get("/results/{rid}")
async def api_get_result(rid: int):
    _init_db()
    with sqlite3.connect(_DB) as conn:
        cur = conn.execute("SELECT params, combos FROM results WHERE id=?", (rid,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "记录不存在")
        params = json.loads(row[0])
        combos = json.loads(row[1])
        return {**params, "combos": combos, "id": rid}

@app.delete("/results/{rid}")
async def api_delete_result(rid: int):
    _init_db()
    with sqlite3.connect(_DB) as conn:
        cur = conn.execute("DELETE FROM results WHERE id=?", (rid,))
        if cur.rowcount == 0:
            raise HTTPException(404, "记录不存在")
        return {"deleted": rid}

########################
#  CLI for quick tests #
########################

def main():
    p = argparse.ArgumentParser(description="Optimal Samples Selection CLI")
    p.add_argument("-m", type=int, required=True, help='总样本数量 (45 <= m <= 54)')
    p.add_argument("-n", type=int, required=True, help='选择的样本数量 (7 <= n <= 25)')
    p.add_argument("-k", type=int, required=True, help='组合大小 (4 <= k <= 7)')
    p.add_argument("-j", type=int, required=True, help='子集大小 (s <= j <= k)')
    p.add_argument("-s", type=int, required=True, help='内部子集大小 (3 <= s <= 7)')
    p.add_argument("-t", type=int, default=1, help='覆盖阈值 (默认: 1)')
    p.add_argument("--samples", type=str, help='逗号分隔的样本列表 (例如: "1,2,3,4,5,6,7")')
    p.add_argument("--random", action="store_true", help="随机选样")
    p.add_argument("--seed", type=int, help="随机种子")
    p.add_argument("--time", type=int, default=10, help="求解时间限制(秒)")
    p.add_argument("--workers", type=int, default=8, help="求解器使用的 CPU 工作线程数 (默认: 8)") # Add workers arg
    args = p.parse_args()

    try:
        # 解析样本列表
        samples_list = None
        if args.samples:
            samples_list = [int(x) for x in args.samples.split(",") if x.strip()]

        # 调用核心函数并计时
        start_cli = time.perf_counter() # Start timer
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
            workers=args.workers, # Pass workers from args
        )
        # execution_time is now part of the result 'res'
        
        # 输出JSON结果 (contains execution_time)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        # Print solver time (if any) and overall success message to stderr
        # The main execution time is already in the JSON output.
        # We can still print the original CLI timer for comparison/verification if needed
        # elapsed_cli = time.perf_counter() - start_cli
        # print(f'CLI Measured Runtime: {elapsed_cli:.3f} s', file=sys.stderr)
        print("算法执行成功。", file=sys.stderr) # Keep success message on stderr

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
