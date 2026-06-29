/* tslint:disable */
/* eslint-disable */

export class BanqiGameWasm {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    applyStep(action: number, seed: bigint): StepResultWasm;
    static fromState(state: Int16Array): BanqiGameWasm;
    static fromStateWithVariant(state: Int16Array, variant: VariantSpecWasm): BanqiGameWasm;
    legalActions(): Int32Array;
    static makeTest(seed: bigint, reveal_count: number): BanqiGameWasm;
    static makeTestWithVariant(seed: bigint, reveal_count: number, variant: VariantSpecWasm): BanqiGameWasm;
    minimaxScores(depth: number, eval_mode: string, time_limit_ms?: bigint | null, action_mask?: Uint32Array | null): Float32Array;
    static softmaxPolicy(scores: Float32Array, temperature: number): Float32Array;
    state(): Int16Array;
    variant(): VariantSpecWasm;
}

export class CollectLeavesResultWasm {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly leafIds: Int32Array;
    readonly states: Int16Array;
}

export class MctsResultWasm {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly action: number;
    readonly policy: Float32Array;
}

export class MctsSessionWasm {
    free(): void;
    [Symbol.dispose](): void;
    applyEvals(leaf_ids: Int32Array, priors_flat: Float32Array, prior_cols: number, values: Float32Array): void;
    close(): void;
    collectLeaves(max_leaves: number): CollectLeavesResultWasm;
    isDone(): boolean;
    constructor(root_state: Int16Array, variant: VariantSpecWasm, simulations: number, seed: bigint, c_puct: number, dirichlet_alpha: number, dirichlet_epsilon: number, root_chance_enumeration: boolean, time_limit_ms?: bigint | null, action_mask?: Uint32Array | null);
    result(move_index: number, root_temperature_moves: number): MctsResultWasm;
    readonly actionSize: number;
    readonly closed: boolean;
}

export class StepResultWasm {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly done: boolean;
    readonly draw: boolean;
    readonly reward: number;
    readonly state: Int16Array;
    readonly winner: number;
}

export class VariantSpecWasm {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static create(variant_name: string, board_height: number, board_width: number, piece_counts_per_color: Int16Array, no_capture_draw_plies: number, max_episode_steps: number): VariantSpecWasm;
    static standard(): VariantSpecWasm;
    readonly actionSize: number;
    readonly boardHeight: number;
    readonly boardSize: number;
    readonly boardWidth: number;
    readonly maxEpisodeSteps: number;
    readonly noCaptureDrawPlies: number;
    readonly pieceCountsPerColor: Int16Array;
    readonly variantName: string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_banqigamewasm_free: (a: number, b: number) => void;
    readonly __wbg_collectleavesresultwasm_free: (a: number, b: number) => void;
    readonly __wbg_mctsresultwasm_free: (a: number, b: number) => void;
    readonly __wbg_mctssessionwasm_free: (a: number, b: number) => void;
    readonly __wbg_stepresultwasm_free: (a: number, b: number) => void;
    readonly __wbg_variantspecwasm_free: (a: number, b: number) => void;
    readonly banqigamewasm_applyStep: (a: number, b: number, c: bigint) => number;
    readonly banqigamewasm_fromState: (a: any) => [number, number, number];
    readonly banqigamewasm_fromStateWithVariant: (a: any, b: number) => [number, number, number];
    readonly banqigamewasm_legalActions: (a: number) => any;
    readonly banqigamewasm_makeTest: (a: bigint, b: number) => number;
    readonly banqigamewasm_makeTestWithVariant: (a: bigint, b: number, c: number) => number;
    readonly banqigamewasm_minimaxScores: (a: number, b: number, c: number, d: number, e: number, f: bigint, g: number, h: number) => [number, number, number];
    readonly banqigamewasm_softmaxPolicy: (a: any, b: number) => any;
    readonly banqigamewasm_state: (a: number) => any;
    readonly banqigamewasm_variant: (a: number) => number;
    readonly collectleavesresultwasm_leafIds: (a: number) => any;
    readonly collectleavesresultwasm_states: (a: number) => any;
    readonly mctsresultwasm_action: (a: number) => number;
    readonly mctsresultwasm_policy: (a: number) => any;
    readonly mctssessionwasm_actionSize: (a: number) => number;
    readonly mctssessionwasm_applyEvals: (a: number, b: any, c: any, d: number, e: any) => [number, number];
    readonly mctssessionwasm_close: (a: number) => void;
    readonly mctssessionwasm_closed: (a: number) => number;
    readonly mctssessionwasm_collectLeaves: (a: number, b: number) => [number, number, number];
    readonly mctssessionwasm_isDone: (a: number) => [number, number, number];
    readonly mctssessionwasm_new: (a: any, b: number, c: number, d: bigint, e: number, f: number, g: number, h: number, i: number, j: bigint, k: number, l: number) => [number, number, number];
    readonly mctssessionwasm_result: (a: number, b: number, c: number) => [number, number, number];
    readonly stepresultwasm_done: (a: number) => number;
    readonly stepresultwasm_draw: (a: number) => number;
    readonly stepresultwasm_reward: (a: number) => number;
    readonly stepresultwasm_state: (a: number) => any;
    readonly stepresultwasm_winner: (a: number) => number;
    readonly variantspecwasm_actionSize: (a: number) => number;
    readonly variantspecwasm_boardSize: (a: number) => number;
    readonly variantspecwasm_boardWidth: (a: number) => number;
    readonly variantspecwasm_create: (a: number, b: number, c: number, d: number, e: any, f: number, g: number) => [number, number, number];
    readonly variantspecwasm_maxEpisodeSteps: (a: number) => number;
    readonly variantspecwasm_noCaptureDrawPlies: (a: number) => number;
    readonly variantspecwasm_pieceCountsPerColor: (a: number) => any;
    readonly variantspecwasm_standard: () => number;
    readonly variantspecwasm_variantName: (a: number) => [number, number];
    readonly variantspecwasm_boardHeight: (a: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
