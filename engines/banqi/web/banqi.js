/* @ts-self-types="./banqi.d.ts" */

export class BanqiGameWasm {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BanqiGameWasm.prototype);
        obj.__wbg_ptr = ptr;
        BanqiGameWasmFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BanqiGameWasmFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_banqigamewasm_free(ptr, 0);
    }
    /**
     * @param {number} action
     * @param {bigint} seed
     * @returns {StepResultWasm}
     */
    applyStep(action, seed) {
        const ret = wasm.banqigamewasm_applyStep(this.__wbg_ptr, action, seed);
        return StepResultWasm.__wrap(ret);
    }
    /**
     * @param {Int16Array} state
     * @returns {BanqiGameWasm}
     */
    static fromState(state) {
        const ret = wasm.banqigamewasm_fromState(state);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return BanqiGameWasm.__wrap(ret[0]);
    }
    /**
     * @param {Int16Array} state
     * @param {VariantSpecWasm} variant
     * @returns {BanqiGameWasm}
     */
    static fromStateWithVariant(state, variant) {
        _assertClass(variant, VariantSpecWasm);
        const ret = wasm.banqigamewasm_fromStateWithVariant(state, variant.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return BanqiGameWasm.__wrap(ret[0]);
    }
    /**
     * @returns {Int32Array}
     */
    legalActions() {
        const ret = wasm.banqigamewasm_legalActions(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {bigint} seed
     * @param {number} reveal_count
     * @returns {BanqiGameWasm}
     */
    static makeTest(seed, reveal_count) {
        const ret = wasm.banqigamewasm_makeTest(seed, reveal_count);
        return BanqiGameWasm.__wrap(ret);
    }
    /**
     * @param {bigint} seed
     * @param {number} reveal_count
     * @param {VariantSpecWasm} variant
     * @returns {BanqiGameWasm}
     */
    static makeTestWithVariant(seed, reveal_count, variant) {
        _assertClass(variant, VariantSpecWasm);
        const ret = wasm.banqigamewasm_makeTestWithVariant(seed, reveal_count, variant.__wbg_ptr);
        return BanqiGameWasm.__wrap(ret);
    }
    /**
     * @param {number} depth
     * @param {string} eval_mode
     * @param {bigint | null} [time_limit_ms]
     * @param {Uint32Array | null} [action_mask]
     * @returns {Float32Array}
     */
    minimaxScores(depth, eval_mode, time_limit_ms, action_mask) {
        const ptr0 = passStringToWasm0(eval_mode, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(action_mask) ? 0 : passArray32ToWasm0(action_mask, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.banqigamewasm_minimaxScores(this.__wbg_ptr, depth, ptr0, len0, !isLikeNone(time_limit_ms), isLikeNone(time_limit_ms) ? BigInt(0) : time_limit_ms, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Float32Array} scores
     * @param {number} temperature
     * @returns {Float32Array}
     */
    static softmaxPolicy(scores, temperature) {
        const ret = wasm.banqigamewasm_softmaxPolicy(scores, temperature);
        return ret;
    }
    /**
     * @returns {Int16Array}
     */
    state() {
        const ret = wasm.banqigamewasm_state(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {VariantSpecWasm}
     */
    variant() {
        const ret = wasm.banqigamewasm_variant(this.__wbg_ptr);
        return VariantSpecWasm.__wrap(ret);
    }
}
if (Symbol.dispose) BanqiGameWasm.prototype[Symbol.dispose] = BanqiGameWasm.prototype.free;

export class CollectLeavesResultWasm {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(CollectLeavesResultWasm.prototype);
        obj.__wbg_ptr = ptr;
        CollectLeavesResultWasmFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CollectLeavesResultWasmFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_collectleavesresultwasm_free(ptr, 0);
    }
    /**
     * @returns {Int32Array}
     */
    get leafIds() {
        const ret = wasm.collectleavesresultwasm_leafIds(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Int16Array}
     */
    get states() {
        const ret = wasm.collectleavesresultwasm_states(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) CollectLeavesResultWasm.prototype[Symbol.dispose] = CollectLeavesResultWasm.prototype.free;

export class MctsResultWasm {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(MctsResultWasm.prototype);
        obj.__wbg_ptr = ptr;
        MctsResultWasmFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MctsResultWasmFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_mctsresultwasm_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get action() {
        const ret = wasm.mctsresultwasm_action(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float32Array}
     */
    get policy() {
        const ret = wasm.mctsresultwasm_policy(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) MctsResultWasm.prototype[Symbol.dispose] = MctsResultWasm.prototype.free;

export class MctsSessionWasm {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MctsSessionWasmFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_mctssessionwasm_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get actionSize() {
        const ret = wasm.mctssessionwasm_actionSize(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {Int32Array} leaf_ids
     * @param {Float32Array} priors_flat
     * @param {number} prior_cols
     * @param {Float32Array} values
     */
    applyEvals(leaf_ids, priors_flat, prior_cols, values) {
        const ret = wasm.mctssessionwasm_applyEvals(this.__wbg_ptr, leaf_ids, priors_flat, prior_cols, values);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    close() {
        wasm.mctssessionwasm_close(this.__wbg_ptr);
    }
    /**
     * @returns {boolean}
     */
    get closed() {
        const ret = wasm.mctssessionwasm_closed(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} max_leaves
     * @returns {CollectLeavesResultWasm}
     */
    collectLeaves(max_leaves) {
        const ret = wasm.mctssessionwasm_collectLeaves(this.__wbg_ptr, max_leaves);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return CollectLeavesResultWasm.__wrap(ret[0]);
    }
    /**
     * @returns {boolean}
     */
    isDone() {
        const ret = wasm.mctssessionwasm_isDone(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    /**
     * @param {Int16Array} root_state
     * @param {VariantSpecWasm} variant
     * @param {number} simulations
     * @param {bigint} seed
     * @param {number} c_puct
     * @param {number} dirichlet_alpha
     * @param {number} dirichlet_epsilon
     * @param {boolean} root_chance_enumeration
     * @param {bigint | null} [time_limit_ms]
     * @param {Uint32Array | null} [action_mask]
     */
    constructor(root_state, variant, simulations, seed, c_puct, dirichlet_alpha, dirichlet_epsilon, root_chance_enumeration, time_limit_ms, action_mask) {
        _assertClass(variant, VariantSpecWasm);
        var ptr0 = isLikeNone(action_mask) ? 0 : passArray32ToWasm0(action_mask, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.mctssessionwasm_new(root_state, variant.__wbg_ptr, simulations, seed, c_puct, dirichlet_alpha, dirichlet_epsilon, root_chance_enumeration, !isLikeNone(time_limit_ms), isLikeNone(time_limit_ms) ? BigInt(0) : time_limit_ms, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        MctsSessionWasmFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} move_index
     * @param {number} root_temperature_moves
     * @returns {MctsResultWasm}
     */
    result(move_index, root_temperature_moves) {
        const ret = wasm.mctssessionwasm_result(this.__wbg_ptr, move_index, root_temperature_moves);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return MctsResultWasm.__wrap(ret[0]);
    }
}
if (Symbol.dispose) MctsSessionWasm.prototype[Symbol.dispose] = MctsSessionWasm.prototype.free;

export class StepResultWasm {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(StepResultWasm.prototype);
        obj.__wbg_ptr = ptr;
        StepResultWasmFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StepResultWasmFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_stepresultwasm_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    get done() {
        const ret = wasm.stepresultwasm_done(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    get draw() {
        const ret = wasm.stepresultwasm_draw(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get reward() {
        const ret = wasm.stepresultwasm_reward(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Int16Array}
     */
    get state() {
        const ret = wasm.stepresultwasm_state(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get winner() {
        const ret = wasm.stepresultwasm_winner(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) StepResultWasm.prototype[Symbol.dispose] = StepResultWasm.prototype.free;

export class VariantSpecWasm {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(VariantSpecWasm.prototype);
        obj.__wbg_ptr = ptr;
        VariantSpecWasmFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        VariantSpecWasmFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_variantspecwasm_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get actionSize() {
        const ret = wasm.variantspecwasm_actionSize(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get boardHeight() {
        const ret = wasm.mctsresultwasm_action(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get boardSize() {
        const ret = wasm.variantspecwasm_boardSize(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get boardWidth() {
        const ret = wasm.variantspecwasm_boardWidth(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {string} variant_name
     * @param {number} board_height
     * @param {number} board_width
     * @param {Int16Array} piece_counts_per_color
     * @param {number} no_capture_draw_plies
     * @param {number} max_episode_steps
     * @returns {VariantSpecWasm}
     */
    static create(variant_name, board_height, board_width, piece_counts_per_color, no_capture_draw_plies, max_episode_steps) {
        const ptr0 = passStringToWasm0(variant_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.variantspecwasm_create(ptr0, len0, board_height, board_width, piece_counts_per_color, no_capture_draw_plies, max_episode_steps);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return VariantSpecWasm.__wrap(ret[0]);
    }
    /**
     * @returns {number}
     */
    get maxEpisodeSteps() {
        const ret = wasm.variantspecwasm_maxEpisodeSteps(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get noCaptureDrawPlies() {
        const ret = wasm.variantspecwasm_noCaptureDrawPlies(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Int16Array}
     */
    get pieceCountsPerColor() {
        const ret = wasm.variantspecwasm_pieceCountsPerColor(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {VariantSpecWasm}
     */
    static standard() {
        const ret = wasm.variantspecwasm_standard();
        return VariantSpecWasm.__wrap(ret);
    }
    /**
     * @returns {string}
     */
    get variantName() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.variantspecwasm_variantName(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) VariantSpecWasm.prototype[Symbol.dispose] = VariantSpecWasm.prototype.free;

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_is_undefined_9e4d92534c42d778: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_throw_be289d5034ed271b: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_389efe28435a9388: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_length_500e25dbc316fd13: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_9a7876c9728a0979: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_b1593d937f31cef9: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_new_from_slice_132ef6dc5072cf68: function(arg0, arg1) {
            const ret = new Float32Array(getArrayF32FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_1c1c42c5954b2701: function(arg0, arg1) {
            const ret = new Int32Array(getArrayI32FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_b5d5e7773e9f2033: function(arg0, arg1) {
            const ret = new Int16Array(getArrayI16FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_no_args_1c7c842f08d00ebb: function(arg0, arg1) {
            const ret = new Function(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_now_2c95c9de01293173: function(arg0) {
            const ret = arg0.now();
            return ret;
        },
        __wbg_performance_7a3ffd0b17f663ad: function(arg0) {
            const ret = arg0.performance;
            return ret;
        },
        __wbg_prototypesetcall_55c7bc6bcd6a9457: function(arg0, arg1, arg2) {
            Int16Array.prototype.set.call(getArrayI16FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_c7e6a26aeade796d: function(arg0, arg1, arg2) {
            Float32Array.prototype.set.call(getArrayF32FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_f8118a9f36fee41e: function(arg0, arg1, arg2) {
            Int32Array.prototype.set.call(getArrayI32FromWasm0(arg0, arg1), arg2);
        },
        __wbg_static_accessor_GLOBAL_12837167ad935116: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_e628e89ab3b1c95f: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_a621d3dfbb60d0ce: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_f8727f0cf888e0bd: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./banqi_bg.js": import0,
    };
}

const BanqiGameWasmFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_banqigamewasm_free(ptr >>> 0, 1));
const CollectLeavesResultWasmFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_collectleavesresultwasm_free(ptr >>> 0, 1));
const MctsResultWasmFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_mctsresultwasm_free(ptr >>> 0, 1));
const MctsSessionWasmFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_mctssessionwasm_free(ptr >>> 0, 1));
const StepResultWasmFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_stepresultwasm_free(ptr >>> 0, 1));
const VariantSpecWasmFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_variantspecwasm_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayI16FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
}

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedInt16ArrayMemory0 = null;
function getInt16ArrayMemory0() {
    if (cachedInt16ArrayMemory0 === null || cachedInt16ArrayMemory0.byteLength === 0) {
        cachedInt16ArrayMemory0 = new Int16Array(wasm.memory.buffer);
    }
    return cachedInt16ArrayMemory0;
}

let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedInt16ArrayMemory0 = null;
    cachedInt32ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('banqi_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
