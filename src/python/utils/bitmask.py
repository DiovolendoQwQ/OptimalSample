import itertools
from typing import List, Set, Tuple

import numpy as np


def generate_masks(item_list: List[Tuple[int, ...]], max_element: int) -> np.ndarray:
    """
    Converts a list of combinations (tuples of integers) into a NumPy boolean array
    and then packs it into a bitmask array (uint8).

    Args:
        item_list: A list where each item is a tuple of integers (e.g., k-combinations).
                   Assumes elements are 1-based, converts to 0-based index.
        max_element: The maximum possible element value (e.g., 'm' or 'n'). This
                     determines the width of the boolean array.

    Returns:
        A NumPy array of dtype uint8 where each row represents a bitmask
        for the corresponding item in item_list.
    """
    if not item_list:
        # Calculate the number of bytes needed for the bitmask width
        num_bytes = (max_element + 7) // 8
        return np.empty(
            (0, num_bytes), dtype=np.uint8
        )  # Return empty array with correct width

    num_items = len(item_list)
    # Create a boolean array (num_items x max_element)
    # Initialize with False. We use max_element as width because indices are 0 to max_element-1
    bool_array = np.zeros((num_items, max_element), dtype=bool)

    for i, item in enumerate(item_list):
        # Convert 1-based elements to 0-based indices for the array
        indices = [x - 1 for x in item if 1 <= x <= max_element]
        if indices:  # Ensure there are valid indices before assignment
            bool_array[i, indices] = True

    # Pack the boolean array into uint8 bitmasks along the element axis (axis=1)
    # 'order=C' is the default and suitable here.
    bitmasks = np.packbits(bool_array, axis=1)

    return bitmasks


def check_s_subset_coverage_bitwise(
    k_combo_masks: np.ndarray,
    j_subset_masks: np.ndarray,
    s_in_k_masks: np.ndarray,
    s_in_j_masks: np.ndarray,
    k_indices: np.ndarray,
    j_indices: np.ndarray,
) -> np.ndarray:
    """
    Checks for each j-subset if any of its s-subsets are covered by any s-subset
    of any *selected* k-combination, using bitwise operations.

    THIS IS COMPLEX and likely not the most efficient way for the greedy step.
    The greedy step needs to know *which specific* k-combo newly covers *which* j-subsets.
    A simple "is covered by *any* selected k" isn't enough.

    Let's rethink the greedy step with bitmasks directly. We don't need this function.
    See the modification in algorithm.py directly.
    """
    raise NotImplementedError(
        "This approach is overly complex for the greedy selection logic."
    )


# Example Usage
if __name__ == "__main__":
    m_example = 10
    samples_example = list(range(1, m_example + 1))
    n_example = 8
    k_example = 6
    j_example = 5
    s_example = 4

    # Generate some k-combos and j-subsets
    k_combos_list = list(itertools.combinations(samples_example[:n_example], k_example))
    j_subsets_list = list(
        itertools.combinations(samples_example[:n_example], j_example)
    )

    print(
        f"Generating masks for {len(k_combos_list)} k-combos and {len(j_subsets_list)} j-subsets..."
    )
    print(f"Max element (n): {n_example}")

    k_combo_masks_arr = generate_masks(k_combos_list, n_example)
    j_subset_masks_arr = generate_masks(j_subsets_list, n_example)

    print(
        f"k_combo_masks shape: {k_combo_masks_arr.shape}, dtype: {k_combo_masks_arr.dtype}"
    )
    print(
        f"j_subset_masks shape: {j_subset_masks_arr.shape}, dtype: {j_subset_masks_arr.dtype}"
    )

    # Example: Check overlap between first k-combo and first j-subset
    # Need to unpack bits to check direct overlap if needed, or use bitwise AND on packed bits
    # Note: np.packbits pads with False, so direct bitwise AND works for checking ANY overlap

    if k_combo_masks_arr.shape[0] > 0 and j_subset_masks_arr.shape[0] > 0:
        overlap_bytes_k0_j0 = np.bitwise_and(
            k_combo_masks_arr[0], j_subset_masks_arr[0]
        )
        print(
            f"\nBitwise AND result for k_combo[0] and j_subset[0]: {overlap_bytes_k0_j0}"
        )
        print(f"Does k_combo[0] overlap with j_subset[0]? {overlap_bytes_k0_j0.any()}")

        # Unpack to verify
        k0_bool = np.unpackbits(k_combo_masks_arr[0])[:n_example]
        j0_bool = np.unpackbits(j_subset_masks_arr[0])[:n_example]
        print(f"k_combo[0] (bool): {k0_bool.astype(int)}")
        print(f"j_subset[0] (bool): {j0_bool.astype(int)}")
        print(f"Actual overlap (bool): {np.bitwise_and(k0_bool, j0_bool).any()}")

    # --- Example for s-subset coverage (Conceptual - Not directly used by greedy) ---
    # Let's take one k-combo and one j-subset
    k_combo_0 = k_combos_list[0]
    j_subset_0 = j_subsets_list[0]

    # Generate their s-subsets
    s_in_k0_list = list(itertools.combinations(k_combo_0, s_example))
    s_in_j0_list = list(itertools.combinations(j_subset_0, s_example))

    # Generate masks for these s-subsets (max_element is still n_example)
    s_in_k0_masks = generate_masks(s_in_k0_list, n_example)
    s_in_j0_masks = generate_masks(s_in_j0_list, n_example)

    print(
        f"\nMasks for s={s_example} subsets of k_combo[0]: shape={s_in_k0_masks.shape}"
    )
    print(
        f"Masks for s={s_example} subsets of j_subset[0]: shape={s_in_j0_masks.shape}"
    )

    # Check if *any* s-subset mask from j0 overlaps with *any* s-subset mask from k0
    is_j0_covered_by_k0 = False
    if s_in_k0_masks.shape[0] > 0 and s_in_j0_masks.shape[0] > 0:
        # Perform pairwise bitwise AND and check if any result has a non-zero byte
        # This requires broadcasting: (num_s_in_j, num_bytes) & (num_s_in_k, num_bytes) -> need expansion
        # Efficient check: For each s_in_j_mask, check if its AND with *any* s_in_k_mask is non-zero.
        for s_j_mask in s_in_j0_masks:
            # Check against all s_in_k masks
            overlap_results = np.bitwise_and(s_j_mask, s_in_k0_masks)
            if np.any(overlap_results):  # Checks if any byte in any result is non-zero
                is_j0_covered_by_k0 = True
                break

    print(
        f"Is j_subset[0] covered (s={s_example}) by k_combo[0]? {is_j0_covered_by_k0}"
    )

    # Compare with set logic
    set_s_in_k0 = {frozenset(s) for s in s_in_k0_list}
    set_s_in_j0 = {frozenset(s) for s in s_in_j0_list}
    is_j0_covered_by_k0_set = not set_s_in_j0.isdisjoint(set_s_in_k0)
    print(f"Is j_subset[0] covered (set logic)? {is_j0_covered_by_k0_set}")
