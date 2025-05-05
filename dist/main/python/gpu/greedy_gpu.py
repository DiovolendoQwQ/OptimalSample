import math
import sys  # Restore the main sys import
import time
from sys import stderr  # Keep direct stderr import
from typing import Any, List, Tuple

import cupy as cp
import numba
import numpy as np
from numba import cuda

# Assume utils.bitmask is available in sys.path due to algorithm.py's modification
try:
    from utils.bitmask import all_masks, build_cover_indices, int_mask
except ImportError:
    print(
        "FATAL ERROR: Cannot import functions from utils.bitmask in greedy_gpu.py. Ensure sys.path is correct.",
        file=stderr,
    )

    # Define placeholders or raise error to prevent runtime issues
    def all_masks(n, r):
        return np.array([], dtype=np.uint64)

    def build_cover_indices(bk, bs):
        return np.array([], dtype=np.int32), np.array([[]], dtype=np.int32)

    def int_mask(i):
        return np.uint64(0)


# --- Optimized Kernels using Sparse Data ---


@cuda.jit
def gain_kernel_sparse(
    bit_k_gpu, offsets_gpu, sparse_covers_data_gpu, uncovered_gpu, gains_gpu
):
    """
    CUDA kernel to calculate gain for each k-set using sparse cover data.
    uncovered_gpu is expected to be bool_ here.
    """
    k_idx = cuda.grid(1)
    if k_idx < bit_k_gpu.size:
        # Get the start and end index for this k-set's covered s-subsets in the sparse array
        start_offset = offsets_gpu[k_idx]
        # Need offsets_gpu[k_idx+1] for the end. Ensure k_idx+1 is within bounds.
        # Handling the last element: its length is total_covers - offsets_gpu[last_k_idx]
        # It's easier if offsets_gpu has size Nk+1, with the last element being total #covers.
        # Let's assume offsets_gpu has Nk+1 elements.
        end_offset = offsets_gpu[k_idx + 1]

        gain = 0
        # Iterate only through the s-subsets covered by this k-set
        for sparse_idx in range(start_offset, end_offset):
            s_idx = sparse_covers_data_gpu[sparse_idx]
            # Check if s_idx is valid (should be, based on build_cover_indices)
            # and if the corresponding element in uncovered_gpu is True
            if s_idx >= 0 and s_idx < uncovered_gpu.size and uncovered_gpu[s_idx]:
                gain += 1
        gains_gpu[k_idx] = gain


@cuda.jit
def update_uncovered_kernel(uncovered_gpu, covers_for_best_k, num_covers):
    """
    CUDA kernel to update uncovered status based on chosen k-set's covers.
    covers_for_best_k contains the s-subset indices covered by the chosen k-set.
    unc
    overed_gpu is expected to be bool_ here.
    """
    # Simple 1D grid covering the indices in covers_for_best_k
    t = cuda.grid(1)
    if t < num_covers:
        s_idx = covers_for_best_k[t]
        # Check if s_idx is valid (already checked during gain, but good practice)
        if s_idx >= 0 and s_idx < uncovered_gpu.size:
            # Direct write is fine for standard greedy as only one k-set is chosen per iter
            if uncovered_gpu[s_idx]:  # Only update if it was True
                uncovered_gpu[s_idx] = False


def greedy_cover_gpu(samples: Tuple[int, ...], k: int, s: int):
    """
    GPU-accelerated greedy algorithm using sparse cover representation and optimized kernels.
    """
    # import sys # Explicit import inside the function - REMOVED, using direct stderr import now
    overall_start_time = time.perf_counter()
    print("Running greedy_cover_gpu (Sparse Optimized)...", file=stderr)
    if not samples:
        return []

    unique_samples = sorted(list(set(samples)))
    n = len(unique_samples)
    idx2sample = np.array(unique_samples)  # CPU array for final mapping

    if n == 0 or k <= 0 or s <= 0 or k > n or s > n:
        return []

    # --- Precomputation (CPU) ---
    cpu_start_time = time.perf_counter()
    print("Greedy GPU Sparse: Generating masks (CPU)...", file=stderr)
    bit_k_np = all_masks(n, k)
    bit_s_np = all_masks(n, s)
    if bit_k_np.size == 0 or bit_s_np.size == 0:
        return []
    Nk = bit_k_np.size
    Ns = bit_s_np.size
    print(f"Greedy GPU Sparse: Generated {Nk} k-masks, {Ns} s-masks.", file=stderr)

    print("Greedy GPU Sparse: Building cover indices (CPU)...", file=stderr)
    counts_np, covers_np = build_cover_indices(
        bit_k_np, bit_s_np
    )  # covers_np shape (Nk, max_c)
    cpu_end_time = time.perf_counter()
    print(
        f"Greedy GPU Sparse: CPU Precomputation took {cpu_end_time - cpu_start_time:.4f}s",
        file=stderr,
    )

    # --- Create Sparse Representation (CPU) ---
    sparse_start_time = time.perf_counter()
    # Calculate offsets (prefix sum of counts) - size Nk + 1
    offsets_np = np.zeros(Nk + 1, dtype=np.int32)
    np.cumsum(counts_np, out=offsets_np[1:])
    total_covers = offsets_np[Nk]  # Total number of cover relations

    # Create sparse data array (flattened list of s-indices)
    sparse_covers_data_np = np.zeros(total_covers, dtype=np.int32)
    current_pos = 0
    for i in range(Nk):
        num_covers_i = counts_np[i]
        if num_covers_i > 0:
            # Extract valid indices from covers_np for this k-set
            valid_covers = covers_np[i, :num_covers_i]
            sparse_covers_data_np[
                current_pos : current_pos + num_covers_i
            ] = valid_covers
            current_pos += num_covers_i

    sparse_end_time = time.perf_counter()
    print(
        f"Greedy GPU Sparse: Sparse data creation took {sparse_end_time - sparse_start_time:.4f}s",
        file=stderr,
    )

    # --- Data Transfer to GPU ---
    transfer_start_time = time.perf_counter()
    print("Greedy GPU Sparse: Transferring data to GPU...", file=stderr)
    try:
        bit_k_gpu = cp.asarray(bit_k_np)
        # bit_s_gpu is NOT needed for the sparse gain kernel
        offsets_gpu = cp.asarray(offsets_np)
        sparse_covers_data_gpu = cp.asarray(sparse_covers_data_np)
        uncovered_gpu = cp.ones(Ns, dtype=cp.bool_)  # Use bool_
        gains_gpu = cp.zeros(Nk, dtype=cp.int32)
    except Exception as e:
        print(f"Greedy GPU Sparse: Error during data transfer: {e}", file=stderr)
        # Clean up any partially transferred data
        vars_to_del = [
            "bit_k_gpu",
            "offsets_gpu",
            "sparse_covers_data_gpu",
            "uncovered_gpu",
            "gains_gpu",
        ]
        for var_name in vars_to_del:
            # Check if var_name exists and is not None before deleting
            # Check if var_name exists and is not None before deleting
            if var_name in locals() and locals()[var_name] is not None:
                del locals()[var_name]
        # Check if 'cp' module was loaded before trying to use it
        # No need for explicit import sys here, top-level one should suffice now
        if "cupy" in sys.modules and cp:
            cp.get_default_memory_pool().free_all_blocks()
        return []  # Cannot proceed
    transfer_end_time = time.perf_counter()
    print(
        f"Greedy GPU Sparse: Data transfer took {transfer_end_time - transfer_start_time:.4f}s",
        file=stderr,
    )

    # --- GPU Greedy Loop ---
    loop_start_time = time.perf_counter()
    chosen_indices_k = []  # Stores indices relative to bit_k
    num_uncovered = Ns
    print(
        f"Greedy GPU Sparse: Starting selection loop to cover {num_uncovered} s-subsets...",
        file=stderr,
    )
    iter_count = 0
    max_iters = Nk + 1  # Safety break

    # Kernel launch configuration
    threadsperblock = 128
    blockspergrid_gain = math.ceil(Nk / threadsperblock)

    while num_uncovered > 0 and iter_count < max_iters:
        iter_count += 1
        iter_start_time = time.perf_counter()

        # 1. Launch gain kernel (sparse version)
        gain_kernel_sparse[blockspergrid_gain, threadsperblock](
            bit_k_gpu, offsets_gpu, sparse_covers_data_gpu, uncovered_gpu, gains_gpu
        )
        # No need to pass bit_s_gpu

        # 2. Find best k-set index and gain (on GPU)
        best_idx_gpu = cp.argmax(gains_gpu)
        # cuda.synchronize() # argmax likely synchronizes implicitly, but explicit doesn't hurt

        # 3. Transfer best_idx and best_gain to CPU
        # It's often faster to get gain value directly from gains_gpu using the GPU index
        best_gain_gpu = gains_gpu[best_idx_gpu]
        # Transfer both index and gain together if possible, or separately
        best_idx = int(best_idx_gpu.get())
        best_gain = int(best_gain_gpu.get())
        # best_gain = int(gains_gpu[best_idx].get()) # Alternative if index transferred first

        if best_gain <= 0:
            print(
                f"Greedy GPU Sparse Iter {iter_count}: No positive gain found.",
                file=stderr,
            )
            break

        chosen_indices_k.append(best_idx)

        # 4. Update uncovered status on GPU
        # Get the number of covers for the best_idx from CPU counts_np
        # Alternatively, calculate from offsets_gpu on GPU (offsets[idx+1] - offsets[idx])
        count_for_best = counts_np[best_idx]

        if count_for_best > 0:
            # Get the slice of sparse data corresponding to best_idx on GPU
            start_sparse = offsets_gpu[best_idx]
            end_sparse = offsets_gpu[best_idx + 1]
            # Create a view/slice on the GPU - avoids copying if possible
            sparse_covers_for_best_k_gpu = sparse_covers_data_gpu[
                start_sparse:end_sparse
            ]

            # Launch update kernel
            blockspergrid_update = math.ceil(count_for_best / threadsperblock)
            if blockspergrid_update > 0:
                update_uncovered_kernel[blockspergrid_update, threadsperblock](
                    uncovered_gpu,
                    sparse_covers_for_best_k_gpu,
                    count_for_best,  # Pass the slice
                )
                # Don't need to synchronize after update kernel unless reading uncovered_gpu immediately

        # 5. Update remaining count (most accurate way is to sync and sum)
        cuda.synchronize()  # Ensure update kernel finishes before sum
        num_uncovered = int(
            cp.sum(uncovered_gpu).get()
        )  # Sum on GPU, transfer scalar result
        iter_end_time = time.perf_counter()
        # print(f"Greedy GPU Sparse Iter {iter_count}: Chose k={best_idx}, Gain={best_gain}, Remain={num_uncovered}, Time={iter_end_time - iter_start_time:.4f}s", file=stderr) # Optional verbose log

    loop_end_time = time.perf_counter()
    print(
        f"Greedy GPU Sparse: Loop finished after {iter_count} iterations in {loop_end_time - loop_start_time:.4f}s",
        file=stderr,
    )

    # --- Finalization ---
    map_start_time = time.perf_counter()
    if iter_count >= max_iters:
        print(
            f"Warning: Greedy GPU Sparse reached max iterations ({max_iters}).",
            file=stderr,
        )
    if num_uncovered > 0:
        print(
            f"Warning: Greedy GPU Sparse finished, but {num_uncovered} s-subsets remain uncovered.",
            file=stderr,
        )
    else:
        print(f"Greedy GPU Sparse selection finished successfully.")

    print(f"Greedy GPU Sparse: Selected {len(chosen_indices_k)} k-sets.", file=stderr)

    # Map chosen indices back to original sample tuples (CPU side)
    greedy_solution_tuples = []
    print("Greedy GPU Sparse: Mapping indices back to tuples...", file=stderr)
    for i in chosen_indices_k:
        if i >= 0 and i < Nk:
            k_mask = bit_k_np[i]  # Use NumPy array for mapping
            member_indices = [
                idx
                for idx in range(n)
                if (np.uint64(k_mask) & np.uint64(int_mask(idx)))
                == np.uint64(int_mask(idx))
            ]
            original_samples_tuple = tuple(idx2sample[member_indices])
            greedy_solution_tuples.append(original_samples_tuple)
        else:
            print(
                f"Warning: Invalid k-set index {i} found in chosen list during mapping.",
                file=stderr,
            )

    map_end_time = time.perf_counter()
    print(
        f"Greedy GPU Sparse: Final mapping took {map_end_time - map_start_time:.4f}s",
        file=stderr,
    )
    print(
        f"Greedy GPU Sparse: Final solution size: {len(greedy_solution_tuples)}",
        file=stderr,
    )

    # Clean up GPU memory
    cleanup_start_time = time.perf_counter()
    try:
        # Ensure all potentially created GPU arrays are deleted
        vars_to_del = [
            "bit_k_gpu",
            "offsets_gpu",
            "sparse_covers_data_gpu",
            "uncovered_gpu",
            "gains_gpu",
            "best_idx_gpu",
            "best_gain_gpu",
        ]
        if "sparse_covers_for_best_k_gpu" in locals():
            vars_to_del.append("sparse_covers_for_best_k_gpu")

        for var_name in vars_to_del:
            # Check if variable exists in local scope before deleting
            if var_name in locals():
                # Check if variable exists in local scope before deleting
                if var_name in locals() and locals()[var_name] is not None:
                    del locals()[var_name]  # Remove local reference

        # Clear CuPy memory pool
        if "cupy" in sys.modules and cp:
            mempool = cp.get_default_memory_pool()
            mempool.free_all_blocks()
            print(
                f"Greedy GPU Sparse: GPU memory cleanup successful. Used bytes: {mempool.used_bytes()}, Total bytes: {mempool.total_bytes()}",
                file=stderr,
            )
    except Exception as e:
        # Explicitly import sys here just in case it's needed for the print/debug below
        # Although the primary NameError likely happens before this print
        # import sys # Removed redundant import inside except block
        print(f"Greedy GPU Sparse: Error during memory cleanup: {e}", file=stderr)
    cleanup_end_time = time.perf_counter()
    print(
        f"Greedy GPU Sparse: Cleanup took {cleanup_end_time - cleanup_start_time:.4f}s",
        file=stderr,
    )

    overall_end_time = time.perf_counter()
    print(
        f"Greedy GPU Sparse: Total execution time {overall_end_time - overall_start_time:.4f}s",
        file=stderr,
    )

    return greedy_solution_tuples
