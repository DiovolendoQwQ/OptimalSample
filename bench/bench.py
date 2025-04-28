import argparse
import csv
import json
import os
import random
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

# Adjust the path to import the algorithm from the correct location
# Assuming bench.py is in 'bench/' and algorithm.py is in 'src/python/'
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "src" / "python"))

try:
    # Import the function to test
    from algorithm import report_progress, select_optimal_samples
except ImportError as e:
    print(f"Error importing algorithm: {e}", file=sys.stderr)
    print(
        "Please ensure the script is run from the project root or adjust sys.path.",
        file=sys.stderr,
    )
    sys.exit(1)

# --- Configuration ---
DEFAULT_NUM_RUNS = 20
DEFAULT_OUTPUT_CSV = "benchmark_results.csv"
PARAMS_TO_RANDOMIZE = {
    # Fixed m for simplicity in this example, can be randomized too
    "m": (45, 54),
    "n": (7, 15),  # Keep n relatively small initially for faster benchmarks
    "k": (5, 7),  # Keep k within reasonable bounds
    # j and s will be derived based on k
}
FIXED_PARAMS = {
    "t": 1,
    "workers": 4,  # Use a fixed number of workers for consistent benchmarks
    "time_limit": 60,  # Set a time limit per run
}

# --- Helper Functions ---


def generate_random_params() -> Dict[str, Any]:
    """Generates a set of random parameters based on PARAMS_TO_RANDOMIZE."""
    m = random.randint(*PARAMS_TO_RANDOMIZE["m"])
    n = random.randint(*PARAMS_TO_RANDOMIZE["n"])
    # Ensure n is within valid range for m (at least 7, max 25, max m)
    n = min(max(n, 7), 25, m)

    k = random.randint(*PARAMS_TO_RANDOMIZE["k"])
    # Ensure k is valid (4 <= k <= 7, k <= n)
    k = min(max(k, 4), 7, n)

    # Derive s and j based on k
    # Ensure s <= j <= k and s>=3
    s = random.randint(3, k)
    j = random.randint(s, k)

    params = {
        "m": m,
        "n": n,
        "k": k,
        "j": j,
        "s": s,
    }
    return params


def run_single_benchmark(run_params: Dict[str, Any]) -> Dict[str, Any]:
    """Runs the algorithm once with given parameters and returns performance metrics."""
    print(f"\nRunning with params: {run_params}")
    start_time = time.perf_counter()
    result = {}
    error_msg = None

    # Use the actual progress reporting mechanism from the algorithm script
    progress_log: List[str] = []

    def bench_progress_callback(percent: int, message: str):
        progress_log.append(f"[{percent}%] {message}")
        print(f"  Progress: {message}")  # Also print to console

    try:
        # Always use random_select for benchmark consistency
        full_params = {**run_params, **FIXED_PARAMS, "random_select": True}
        # Call the algorithm function directly
        # NOTE: This assumes select_optimal_samples prints JSON internally for progress/result
        #       We capture the final result dict returned by the function.
        algo_result = select_optimal_samples(
            **full_params, progress_callback=bench_progress_callback
        )

        end_time = time.perf_counter()

        result = {
            "m": run_params["m"],
            "n": run_params["n"],
            "k": run_params["k"],
            "j": run_params["j"],
            "s": run_params["s"],
            "t": FIXED_PARAMS["t"],
            "workers": FIXED_PARAMS["workers"],
            "execution_time": algo_result.get(
                "execution_time", end_time - start_time
            ),  # Use reported time if available
            "solver_time": algo_result.get(
                "solver_wall_time", None
            ),  # Get solver time if reported
            "num_combos": len(algo_result.get("combos", [])),
            "status": "success",
            "error": None,
            # "progress": "\n".join(progress_log), # Optional: log full progress
        }
        print(
            f"  Success! Time: {result['execution_time']:.3f}s, Combos: {result['num_combos']}"
        )

    except Exception as e:
        end_time = time.perf_counter()
        error_msg = str(e)
        print(f"  Error: {error_msg}")
        result = {
            "m": run_params["m"],
            "n": run_params["n"],
            "k": run_params["k"],
            "j": run_params["j"],
            "s": run_params["s"],
            "t": FIXED_PARAMS["t"],
            "workers": FIXED_PARAMS["workers"],
            "execution_time": end_time - start_time,
            "solver_time": None,
            "num_combos": None,
            "status": "error",
            "error": error_msg,
            # "progress": "\n".join(progress_log),
        }

    return result


# --- Main Execution ---


def main():
    parser = argparse.ArgumentParser(
        description="Benchmark script for Optimal Samples Selection algorithm."
    )
    parser.add_argument(
        "-n",
        "--num-runs",
        type=int,
        default=DEFAULT_NUM_RUNS,
        help=f"Number of random parameter sets to benchmark (default: {DEFAULT_NUM_RUNS})",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=str,
        default=DEFAULT_OUTPUT_CSV,
        help=f"Output CSV file path (default: {DEFAULT_OUTPUT_CSV})",
    )
    args = parser.parse_args()

    results = []
    output_path = Path(args.output)
    # Create parent directory if it doesn't exist
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Starting benchmark with {args.num_runs} runs...")
    print(f"Results will be saved to: {output_path}")

    for i in range(args.num_runs):
        print(f"\n--- Run {i+1}/{args.num_runs} ---")
        random_params = generate_random_params()
        run_result = run_single_benchmark(random_params)
        results.append(run_result)
        # Optional: Add a small delay between runs if needed
        # time.sleep(0.5)

    # --- Save Results to CSV ---
    if not results:
        print("No results generated.")
        return

    fieldnames = list(results[0].keys())
    try:
        with open(output_path, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)
        print(f"\nBenchmark results saved successfully to {output_path}")
    except IOError as e:
        print(f"\nError saving results to CSV: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
