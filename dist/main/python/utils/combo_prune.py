import itertools
import sys  # Import sys at the top level
from typing import List, Tuple


def unique_k_combos(samples: List[int], k: int, s: int) -> List[Tuple[int, ...]]:
    """
    Filters k-combinations based on their s-subset signatures.

    For set cover problems where s=j, k-combinations that cover the exact
    same set of s-subsets (j-subsets in this case) are redundant for finding
    a solution. This function keeps only one representative k-combination
    for each unique s-subset signature.

    Args:
        samples: The list of initial samples (e.g., [1, 2, ... n]).
        k: The size of the combinations to generate.
        s: The size of the internal subsets used for the signature.

    Returns:
        A list of unique k-combinations based on s-subset signatures.
    """
    if s > k:
        # This case should not happen if parameters are validated, but good to check.
        raise ValueError(
            "s cannot be greater than k for generating s-subset signatures."
        )

    sig_to_combo: dict[Tuple[Tuple[int, ...], ...], Tuple[int, ...]] = {}
    count_original = 0
    count_duplicate = 0

    # Generate all k-combinations from the samples
    all_k_combos = itertools.combinations(samples, k)

    for combo in all_k_combos:
        count_original += 1
        # Calculate the signature: a sorted tuple of sorted s-subsets
        # Sorting ensures that the order of elements within subsets and the order
        # of subsets themselves don't affect the signature.
        s_subsets = itertools.combinations(combo, s)
        # Ensure subsets are tuples and sort elements within each subset, then sort the subsets
        signature = tuple(sorted(tuple(sorted(subset)) for subset in s_subsets))

        # Store the first combo encountered for this signature
        if signature not in sig_to_combo:
            sig_to_combo[signature] = combo
        else:
            count_duplicate += 1

    unique_combos = list(sig_to_combo.values())
    print(
        f"unique_k_combos: Original k-combos={count_original}, Duplicates pruned={count_duplicate}, Unique signatures={len(unique_combos)}",
        file=sys.stderr,
    )

    return unique_combos


# Example Usage (if run directly)
if __name__ == "__main__":
    # sys is already imported at the top
    samples_example = list(range(1, 8))  # n=7
    k_example = 6
    s_example = 5  # s=j=5

    unique_combos_list = unique_k_combos(samples_example, k_example, s_example)

    print(f"\nExample: n={len(samples_example)}, k={k_example}, s={s_example}")
    print(
        f"Total k-combinations ({len(samples_example)}C{k_example}): {len(list(itertools.combinations(samples_example, k_example)))}"
    )
    print(f"Unique combinations based on s-subset signature: {len(unique_combos_list)}")
    # print("Unique combos:")
    # for uc in unique_combos_list:
    #     print(uc)

    # Example 2: s < k
    k_example_2 = 6
    s_example_2 = 4
    unique_combos_list_2 = unique_k_combos(samples_example, k_example_2, s_example_2)
    print(f"\nExample 2: n={len(samples_example)}, k={k_example_2}, s={s_example_2}")
    print(
        f"Total k-combinations ({len(samples_example)}C{k_example_2}): {len(list(itertools.combinations(samples_example, k_example_2)))}"
    )
    print(
        f"Unique combinations based on s-subset signature: {len(unique_combos_list_2)}"
    )
