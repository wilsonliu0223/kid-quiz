# banqi-minimax

High-performance game engine for **Banqi** (暗棋, Chinese Dark Chess) with Minimax and MCTS search algorithms, written in Rust.

## Features

- **Minimax Search** with alpha-beta pruning and transposition table
- **Monte Carlo Tree Search (MCTS)** with Dirichlet noise and chance node enumeration
- **Depth-1 flip caching** for dramatically faster expectimax evaluation
- **Parallel root evaluation** via Rayon work-stealing
- **Customizable game variants** (board size, piece counts, draw rules)
- Two material evaluation modes: **Static** (simple counting) and **Dynamic** (scarcity-adjusted)

## Usage

Add to your `Cargo.toml`:

```toml
[dependencies]
banqi-minimax = { git = "https://github.com/jacoblincool/banqi-minimax" }
```

### Basic Example

```rust
use banqi::game::logic::make_test_state;
use banqi::game::variant::VariantSpec;
use banqi::minimax::{minimax_scores_one, EvalMode};

let spec = VariantSpec::standard();
let state = make_test_state(42, 16, &spec); // seed=42, 16 pieces revealed

let scores = minimax_scores_one(state, 3, &spec, EvalMode::Dynamic);
// scores[action] = expected value for each legal action
```

### Arena (Self-Play)

Compare Static vs Dynamic evaluation:

```bash
cargo run --features cli --release --bin arena -- --games 10 --depth 3
```

### Python (PyO3 + Maturin)

Build and install the local extension module:

```bash
maturin develop --features python
```

Example:

```python
from banqi import BanqiGame, VariantSpec

variant = VariantSpec.standard()
game = BanqiGame.make_test(seed=42, reveal_count=8, variant=variant)
scores = game.minimax_scores(depth=2, eval_mode="dynamic")
```

Smoke test:

```bash
pytest python/tests/test_bindings_smoke.py
```

### WebAssembly (wasm-bindgen + wasm-pack + Vite)

Run the browser minimax playground with Vite:

```bash
cd examples/wasm-web
pnpm install
pnpm dev
```

The Vite scripts call `wasm-pack` and generate `examples/wasm-web/pkg/`.

Build Node package and run smoke test:

```bash
wasm-pack build --target nodejs --out-dir pkg-node --out-name banqi . --features wasm
node examples/wasm-web/smoke-node.mjs
```

## Architecture

### State Representation

Game state is a fixed-size `[i16; 66]` array (132 bytes), passed by value (`Copy`):

| Index | Content                                          |
| ----- | ------------------------------------------------ |
| 0-31  | Board cells (0=empty, 15=face-down, 1-14=pieces) |
| 32    | Side to move                                     |
| 33    | No-capture ply counter                           |
| 34    | Ply count                                        |
| 35    | Board size                                       |
| 36-49 | Unflipped piece pool (14 types)                  |
| 50-63 | Captured piece counts (14 types)                 |
| 64-65 | Player color assignments                         |

### Search

- **Depth <= 3**: Parallel root evaluation (Rayon) without transposition table
- **Depth > 3**: Sequential evaluation with 4-way set-associative transposition table (262K entries)
- **Move ordering**: Captures > Quiet moves > Flips (O(n) partition)
- **Flip caching**: At depth 1, all flip actions share the same expected value since material evaluation is position-independent

### Modules

| Module          | Description                                         |
| --------------- | --------------------------------------------------- |
| `game::variant` | Game variant configuration (`VariantSpec`)          |
| `game::logic`   | Core game mechanics, legal actions, evaluation      |
| `game::rng`     | Deterministic RNG (SplitMix64)                      |
| `minimax`       | Alpha-beta minimax with expectimax for chance nodes |
| `mcts`          | Monte Carlo Tree Search with UCB exploration        |

## Benchmarks

```bash
cargo bench --bench minimax
```

Typical results on Apple M1 Pro 2021 (depth 3, 16 revealed pieces):

| Metric  | Value   |
| ------- | ------- |
| Depth 2 | ~125 us |
| Depth 3 | ~6.5 ms |
| Depth 4 | ~6.3 s  |

## Development

```bash
# Run tests
cargo test

# Check Python bindings compile
cargo check --features python

# Check wasm bindings compile
cargo check --target wasm32-unknown-unknown --features wasm

# Run snapshot tests
cargo test --test minimax_snapshot

# Update snapshots after intentional changes
cargo insta review

# Run benchmarks
cargo bench
```

## License

MIT
