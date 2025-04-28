import random
import sys
from pathlib import Path

import pytest

# Adjust path to import the algorithm
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "src" / "python"))

try:
    from algorithm import select_optimal_samples
except ImportError as e:
    print(f"Error importing algorithm in test: {e}", file=sys.stderr)

    # Define a dummy function if import fails, so tests can be discovered but will fail clearly
    def select_optimal_samples(*args, **kwargs):
        raise ImportError("Could not import select_optimal_samples")


# Define a fixed set of parameters for benchmark consistency
# Choose parameters that are reasonably fast but representative
BENCHMARK_PARAMS = {
    "m": 50,
    "n": 12,
    "k": 6,
    "j": 5,
    "s": 4,  # s < j case (uses greedy)
    "t": 1,
    "random_select": True,  # Use random select for simplicity
    "seed": 42,  # Use a fixed seed for reproducibility
    "workers": 1,  # Use 1 worker for consistent single-thread benchmark
    "time_limit": 60,  # Generous time limit for benchmark run
}

# Define another set for s == j case
BENCHMARK_PARAMS_SJ_EQ_J = {
    "m": 48,
    "n": 10,
    "k": 5,
    "j": 4,
    "s": 4,  # s == j case (uses CP-SAT)
    "t": 1,
    "random_select": True,
    "seed": 123,
    "workers": 1,  # Use 1 worker
    "time_limit": 60,
}


@pytest.mark.benchmark(group="algorithm_greedy")
def test_algorithm_performance_greedy(benchmark):
    """Benchmark the select_optimal_samples function for s < j case."""
    # The benchmark fixture runs the passed function multiple times
    try:
        result = benchmark(select_optimal_samples, **BENCHMARK_PARAMS)
        # Optional: Add assertions on the result if needed
        assert isinstance(result, dict)
        assert "combos" in result
        print(
            f"\nGreedy Benchmark Result: {len(result['combos'])} combos, Time: {result['execution_time']:.4f}s"
        )
    except ImportError:
        pytest.fail("Failed to import select_optimal_samples for benchmarking.")
    except Exception as e:
        pytest.fail(f"Benchmarking greedy algorithm failed with error: {e}")


@pytest.mark.benchmark(group="algorithm_cpsat")
def test_algorithm_performance_cpsat(benchmark):
    """Benchmark the select_optimal_samples function for s == j case."""
    try:
        result = benchmark(select_optimal_samples, **BENCHMARK_PARAMS_SJ_EQ_J)
        # Optional: Add assertions on the result if needed
        assert isinstance(result, dict)
        assert "combos" in result
        print(
            f"\nCP-SAT Benchmark Result: {len(result['combos'])} combos, Time: {result['execution_time']:.4f}s"
        )
    except ImportError:
        pytest.fail("Failed to import select_optimal_samples for benchmarking.")
    except Exception as e:
        pytest.fail(f"Benchmarking CP-SAT algorithm failed with error: {e}")
