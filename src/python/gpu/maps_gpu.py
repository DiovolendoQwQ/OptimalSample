import sys
import time
from itertools import combinations
from sys import stderr
from typing import Dict, List, Tuple

import cupy as cp
import numpy as np


# --- Optimized Blocked GPU Map Building ---
def _build_map_gpu(
    samples_tuple: Tuple[int, ...], k: int, s: int, block_size: int = 4096
):
    """
    GPU (CuPy) implementation for building the s-subset to k-combo index map using blocked computation
    to reduce peak memory usage.
    Returns: (unique_s_subset_map, s_subset_covers_k_indices, s_masks_gpu)
    """
    overall_start_time = time.perf_counter()
    print(
        f"Using GPU (CuPy) for map building (Blocked, block_size={block_size})...",
        file=sys.stderr,
    )
    n = len(samples_tuple)

    # --- CPU Precomputation ---
    cpu_start_time = time.perf_counter()
    # Generate indices on CPU first
    k_indices = list(combinations(range(n), k))
    s_indices = list(combinations(range(n), s))
    num_k_combos = len(k_indices)
    num_s_combos = len(s_indices)

    if num_k_combos == 0 or num_s_combos == 0:
        print("Warning: No k-combinations or s-subsets generated.", file=sys.stderr)
        return {}, [], None  # Return empty map, list, and None for masks

    # Create unique s-subset map (on CPU side)
    # Sort the tuples from s_indices to ensure canonical representation
    # We need the original sample values for the map keys
    s_combos_tuples_sorted = [
        tuple(sorted(samples_tuple[i] for i in c)) for c in s_indices
    ]
    unique_s_subset_map = {
        s_tuple: uid
        for uid, s_tuple in enumerate(sorted(list(set(s_combos_tuples_sorted))))
    }
    num_unique_s_subsets = len(unique_s_subset_map)  # Number of unique s-subsets

    # Map original s-combo index (0..Ns-1) to unique s-subset UID
    s_combo_idx_to_uid = np.zeros(num_s_combos, dtype=np.int32)
    for i, s_combo_tuple in enumerate(s_combos_tuples_sorted):
        if s_combo_tuple in unique_s_subset_map:
            s_combo_idx_to_uid[i] = unique_s_subset_map[s_combo_tuple]
        else:
            # This shouldn't happen if unique_s_subset_map is built correctly
            print(
                f"Warning: s-combo tuple {s_combo_tuple} not found in unique map. Assigning UID -1.",
                file=sys.stderr,
            )
            s_combo_idx_to_uid[i] = -1  # Mark as invalid

    cpu_end_time = time.perf_counter()
    print(
        f"Blocked Map Build: CPU precomputation took {cpu_end_time - cpu_start_time:.4f}s",
        file=sys.stderr,
    )

    # --- GPU Processing ---
    gpu_processing_start_time = time.perf_counter()
    all_cpu_rows = []  # To store k-combo indices (relative to full list)
    all_cpu_cols = []  # To store s-subset UIDs

    # Generate one-hot masks on GPU (needed repeatedly in blocks)
    try:
        hot_gpu = cp.asarray([1 << i for i in range(n)], dtype=cp.uint64)
    except Exception as e:
        print(f"Error creating initial 'hot' array on GPU: {e}", file=sys.stderr)
        return {}, [], None  # Cannot proceed

    # Initialize return variables
    s_masks_gpu_full = None  # Will hold the final full s-masks array

    try:
        # Calculate number of blocks
        num_k_blocks = (num_k_combos + block_size - 1) // block_size
        num_s_blocks = (num_s_combos + block_size - 1) // block_size
        print(
            f"Blocked Map Build: Processing {num_k_combos} k-combos and {num_s_combos} s-subsets in {num_k_blocks}x{num_s_blocks} blocks.",
            file=sys.stderr,
        )

        # --- Generate full s_masks once (needed for return and potentially greedy) ---
        # This still uses memory, but perhaps less than the full Nk x Ns matrix
        s_masks_list = []
        for s_block_idx in range(num_s_blocks):
            s_start = s_block_idx * block_size
            s_end = min((s_block_idx + 1) * block_size, num_s_combos)
            s_indices_block = s_indices[s_start:s_end]
            if not s_indices_block:
                continue
            s_masks_block = cp.array(
                [hot_gpu[list(c)].sum(dtype=cp.uint64) for c in s_indices_block],
                dtype=cp.uint64,
            )
            s_masks_list.append(s_masks_block)
            del s_masks_block  # Free block immediately
            cp.get_default_memory_pool().free_all_blocks()

        if s_masks_list:
            s_masks_gpu_full = cp.concatenate(s_masks_list)
            del s_masks_list  # Free list of blocks
            cp.get_default_memory_pool().free_all_blocks()
            print(
                f"Blocked Map Build: Generated full s_masks array (size {s_masks_gpu_full.size}).",
                file=sys.stderr,
            )
        else:
            print("Error: Could not generate any s-mask blocks.", file=sys.stderr)
            raise RuntimeError(
                "Failed to generate s-masks"
            )  # Raise error to trigger cleanup

        # --- Blocked Cover Matrix Calculation ---
        for k_block_idx in range(num_k_blocks):
            k_start = k_block_idx * block_size
            k_end = min((k_block_idx + 1) * block_size, num_k_combos)
            k_indices_block = k_indices[k_start:k_end]
            if not k_indices_block:
                continue
            print(
                f"  Processing K-block {k_block_idx+1}/{num_k_blocks} (indices {k_start}-{k_end-1})",
                file=sys.stderr,
            )

            k_masks_block = cp.array(
                [hot_gpu[list(c)].sum(dtype=cp.uint64) for c in k_indices_block],
                dtype=cp.uint64,
            )

            for s_block_idx in range(num_s_blocks):
                s_start = s_block_idx * block_size
                s_end = min((s_block_idx + 1) * block_size, num_s_combos)
                if s_start >= s_end:
                    continue  # Skip empty s-blocks

                # Get the corresponding slice from the *full* s_masks_gpu array
                s_masks_block_view = s_masks_gpu_full[s_start:s_end]

                # Calculate cover matrix for the block
                cover_mat_block = (
                    k_masks_block[:, None] & s_masks_block_view
                ) == s_masks_block_view

                # Find indices where cover_mat_block is True
                idx_rows_block_gpu, idx_cols_block_gpu = cp.where(cover_mat_block)

                # Transfer indices back to CPU
                cpu_rows_block = idx_rows_block_gpu.get()
                cpu_cols_block = idx_cols_block_gpu.get()

                # Adjust indices to be relative to the full lists and store
                # Rows are relative to k_masks_block, need offset k_start
                # Cols are relative to s_masks_block_view, need offset s_start
                all_cpu_rows.extend(cpu_rows_block + k_start)
                # Map s-combo column index (relative to block, s_start offset) back to unique s-subset UID
                # Retrieve the original s-combo index (absolute)
                original_s_combo_indices = cpu_cols_block + s_start
                # Map these absolute s-combo indices to their UIDs
                mapped_uids = s_combo_idx_to_uid[original_s_combo_indices]
                all_cpu_cols.extend(mapped_uids)

                # Clean up block-specific GPU memory
                del (
                    cover_mat_block,
                    idx_rows_block_gpu,
                    idx_cols_block_gpu,
                    s_masks_block_view,
                )
                cp.get_default_memory_pool().free_all_blocks()

            # Clean up k-block specific memory
            del k_masks_block
            cp.get_default_memory_pool().free_all_blocks()

    except Exception as e:
        print(
            f"Error during GPU blocked map building computation: {e}", file=sys.stderr
        )
        # Ensure cleanup happens and return defaults
        unique_s_subset_map = {}
        s_subset_covers_k_indices = []
        if "s_masks_gpu_full" in locals():
            del s_masks_gpu_full
        if "hot_gpu" in locals():
            del hot_gpu
        if "cp" in globals() and cp and hasattr(cp, "get_default_memory_pool"):
            try:
                cp.get_default_memory_pool().free_all_blocks()
            except:
                pass  # Ignore cleanup errors during handling of main error
        return {}, [], None

    finally:
        # Final cleanup of persistent GPU arrays
        if "hot_gpu" in locals():
            del hot_gpu
        if "cp" in globals() and cp and hasattr(cp, "get_default_memory_pool"):
            try:
                cp.get_default_memory_pool().free_all_blocks()
            except Exception as cleanup_e:
                print(
                    f"Warning: Error during final GPU memory pool cleanup: {cleanup_e}",
                    file=sys.stderr,
                )

    gpu_processing_end_time = time.perf_counter()
    print(
        f"Blocked Map Build: GPU processing took {gpu_processing_end_time - gpu_processing_start_time:.4f}s",
        file=sys.stderr,
    )

    # --- CPU Post-processing ---
    post_start_time = time.perf_counter()
    # Populate the final list from collected CPU results
    s_subset_covers_k_indices = [[] for _ in range(num_unique_s_subsets)]
    valid_pairs = 0
    for k_idx_full, s_uid in zip(all_cpu_rows, all_cpu_cols):
        if 0 <= s_uid < num_unique_s_subsets:  # Check if UID is valid
            s_subset_covers_k_indices[s_uid].append(int(k_idx_full))  # Ensure int
            valid_pairs += 1
        # else: # Optional: Log invalid UIDs found
        #    print(f"Warning: Encountered invalid s-subset UID {s_uid} for k-idx {k_idx_full}", file=sys.stderr)

    post_end_time = time.perf_counter()
    print(
        f"Blocked Map Build: Found {valid_pairs} cover relationships.", file=sys.stderr
    )
    print(
        f"Blocked Map Build: CPU post-processing took {post_end_time - post_start_time:.4f}s",
        file=sys.stderr,
    )

    overall_end_time = time.perf_counter()
    print(
        f"Blocked Map Build: Total execution time {overall_end_time - overall_start_time:.4f}s",
        file=sys.stderr,
    )

    # Return the map, the populated list, and the full s_masks GPU array
    return unique_s_subset_map, s_subset_covers_k_indices, s_masks_gpu_full
