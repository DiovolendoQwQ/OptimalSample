import sys
from typing import Union

import cupy as cp
import numpy as np  # Might be needed if pool_k_masks is passed as numpy


def pool_validate_gpu(
    pool_k_masks: Union[cp.ndarray, np.ndarray], s_masks: Union[cp.ndarray, np.ndarray]
) -> bool:
    """
    Validates if the candidate pool (represented by k-masks) covers all s-subsets (s-masks) using GPU.

    Args:
        pool_k_masks: A CuPy or NumPy array of uint64 masks for the k-combinations in the pool.
        s_masks: A CuPy or NumPy array of uint64 masks for all unique s-subsets.

    Returns:
        True if all s-subsets are covered by at least one k-mask in the pool, False otherwise.
    """
    print(
        f"GPU Pool Validation: Validating pool_k_masks (size {len(pool_k_masks)}) against s_masks (size {len(s_masks)})...",
        file=sys.stderr,
    )
    if len(pool_k_masks) == 0 or len(s_masks) == 0:
        # If pool is empty, cannot cover anything unless s_masks is also empty.
        # If s_masks is empty, coverage is trivially true.
        return len(s_masks) == 0

    try:
        # Ensure arrays are on the GPU
        pool_k_masks_gpu = cp.asarray(pool_k_masks)
        s_masks_gpu = cp.asarray(s_masks)

        # Check coverage: ((pool_k_masks_gpu[:, None] & s_masks_gpu) == s_masks_gpu) -> shape (|Pool|, |S|)
        # .any(axis=0) -> Checks if *any* k-mask covers each s-mask -> shape (|S|,)
        # ~ -> Inverts the boolean array (True where s-mask is NOT covered)
        # .sum() -> Counts how many s-masks are NOT covered
        # .get() -> Transfers the count (a CuPy scalar) back to CPU
        cover_check = (pool_k_masks_gpu[:, None] & s_masks_gpu) == s_masks_gpu
        covered_per_s = cover_check.any(axis=0)  # Shape (|S|,)
        missing_count = int((~covered_per_s).sum().get())

        print(
            f"GPU Pool Validation: Found {missing_count} uncovered s-subsets.",
            file=sys.stderr,
        )

        # Clean up GPU memory
        del pool_k_masks_gpu, s_masks_gpu, cover_check, covered_per_s
        cp.get_default_memory_pool().free_all_blocks()

        return missing_count == 0

    except Exception as e:
        print(f"Error during GPU pool validation: {e}", file=sys.stderr)
        # Fallback or error handling: Assume validation failed in case of error
        return False
