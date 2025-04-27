"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAlgorithmParams = validateAlgorithmParams;
exports.quickValidateParamsForUI = quickValidateParamsForUI;
/**
 * Validates the core algorithm parameters based on project constraints.
 * Throws an error if validation fails.
 *
 * @param params - The parameters to validate.
 * @throws {Error} If any parameter is invalid.
 */
function validateAlgorithmParams(params) {
    const { m, n, k, j, s, samples } = params;
    // --- Type Checks ---
    if (typeof m !== 'number' || typeof n !== 'number' || typeof k !== 'number' ||
        typeof j !== 'number' || typeof s !== 'number' || !Array.isArray(samples)) {
        throw new Error('Invalid parameter types. m, n, k, j, s must be numbers, samples must be an array.');
    }
    if (!samples.every(sample => typeof sample === 'number')) {
        throw new Error('Invalid samples array: all elements must be numbers.');
    }
    // --- Range Checks (Based on project description) ---
    if (!(m >= 45 && m <= 54)) {
        throw new Error(`Invalid m: ${m}. Must be between 45 and 54.`);
    }
    if (!(n >= 7 && n <= 25)) {
        throw new Error(`Invalid n: ${n}. Must be between 7 and 25.`);
    }
    if (!(k >= 4 && k <= 7)) {
        throw new Error(`Invalid k: ${k}. Must be between 4 and 7.`);
    }
    if (!(s >= 3 && s <= 7)) {
        throw new Error(`Invalid s: ${s}. Must be between 3 and 7.`);
    }
    // j depends on s and k
    if (!(j >= s && j <= k)) {
        throw new Error(`Invalid j: ${j}. Constraint s <= j <= k not met (s=${s}, k=${k}).`);
    }
    // --- Sample Array Checks ---
    if (samples.length !== n) {
        throw new Error(`Invalid number of samples provided: expected ${n}, got ${samples.length}.`);
    }
    // Check for uniqueness (optional but good practice)
    if (new Set(samples).size !== samples.length) {
        throw new Error('Invalid samples: contains duplicate values.');
    }
    // Check if samples are within the valid range [1, m]
    if (!samples.every(sample => sample >= 1 && sample <= m)) {
        throw new Error(`Invalid samples: all values must be between 1 and ${m}. Found values outside this range.`);
    }
    // --- Additional Checks (Optional) ---
    // e.g., Check if n > k (necessary for combinations)
    if (n < k) {
        throw new Error(`Invalid input: n (${n}) must be greater than or equal to k (${k}) to form k-combinations.`);
    }
    if (n < j) {
        throw new Error(`Invalid input: n (${n}) must be greater than or equal to j (${j}) to form j-subsets.`);
    }
    if (j < s) {
        // This is already covered by (s >= 3 && s <= 7) and (j >= s && j <= k), but explicit check doesn't hurt
        throw new Error(`Invalid input: j (${j}) must be greater than or equal to s (${s}).`);
    }
    if (k < s) {
        // This is also likely covered, but good to be explicit
        throw new Error(`Invalid input: k (${k}) must be greater than or equal to s (${s}).`);
    }
    console.log("Parameter validation successful for:", params);
}
/**
 * Performs a quick check suitable for UI validation before sending to main process.
 * Returns true if basic checks pass, false otherwise. Does not throw errors.
 *
 * @param params - Partial parameters, potentially with string inputs.
 * @returns {boolean} True if basic checks pass, false otherwise.
 */
function quickValidateParamsForUI(params) {
    try {
        const numM = Number(params.m);
        const numN = Number(params.n);
        const numK = Number(params.k);
        const numJ = Number(params.j);
        const numS = Number(params.s);
        if (isNaN(numM) || isNaN(numN) || isNaN(numK) || isNaN(numJ) || isNaN(numS))
            return false;
        if (numM < 45 || numM > 54)
            return false;
        if (numN < 7 || numN > 25)
            return false;
        if (numK < 4 || numK > 7)
            return false;
        if (numS < 3 || numS > 7)
            return false;
        if (numJ < numS || numJ > numK)
            return false;
        if (typeof params.samples !== 'string')
            return false; // Expect comma-separated string for quick check
        const sampleParts = params.samples.split(',').map(p => p.trim()).filter(p => p !== '');
        if (sampleParts.length !== numN)
            return false; // Check count first
        const samplesNum = sampleParts.map(Number);
        if (samplesNum.some(isNaN))
            return false; // Check if all are numbers
        if (new Set(samplesNum).size !== samplesNum.length)
            return false; // Check uniqueness
        if (!samplesNum.every(sn => sn >= 1 && sn <= numM))
            return false; // Check range
        return true;
    }
    catch {
        return false; // Any error during quick check means invalid
    }
}
