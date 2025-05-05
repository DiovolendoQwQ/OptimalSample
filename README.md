# 最优样本选择系统 - 用户手册

## 1. 简介

欢迎使用最优样本选择系统。本应用程序旨在解决一个特定的组合优化问题：给定一个包含 `m` 个总样本的集合，从中选取 `n` 个初始样本，然后需要找到一个 **最小数量** 的、每个包含 `k` 个样本的组（称为 k-组合），这个组集合需要满足特定的覆盖要求。

覆盖要求是针对所有从 `n` 个初始样本中选出的、包含 `j` 个样本的子集（称为 j-子集）来定义的。对于每一个 j-子集，我们需要其内部包含的、由 `s` 个样本构成的子集（称为 s-子集），至少被我们选出的 k-组合集合中的 `t` 个（阈值）所“覆盖”。“覆盖”的定义是：一个 k-组合覆盖一个 j-子集（在 s-层级上），当且仅当这个 j-子集至少有一个 s-子集，同时也是这个 k-组合的一个 s-子集。

本系统提供了一个图形用户界面 (GUI)，允许用户输入参数（m, n, k, j, s, t）和初始样本列表，然后调用后端 Python 算法计算出满足条件的最优（或近似最优）k-组合集合，并将结果保存到**项目内部的 `database` 文件夹**中以供后续查看、管理和导出。

该软件基于 Electron 框架开发，结合了 React (使用 Vite 构建) 构建用户界面，并调用 Python 脚本执行核心的组合优化计算。

## 2. 软件架构与技术栈

### 2.1 软件架构

本应用程序采用标准的 **Electron** 架构，结合 **Python** 后端进行核心算法处理，具体分为以下几个主要部分：

*   **主进程 (Main Process)**:
    *   由 Electron 负责启动和管理。
    *   入口文件：`src/main/index.ts` (编译后为 `dist/main/main/index.js`)。
    *   职责：创建和管理应用程序窗口 (`BrowserWindow`)、处理原生操作系统事件、协调渲染进程和后端服务、管理所有 IPC (进程间通信) 逻辑、**处理数据库文件的创建、读取、删除和导出**。
    *   IPC 处理程序位于 `src/main/ipcHandlers/` 目录下（例如 `run-handler.ts`, `db-handler.ts`），负责响应来自渲染进程的请求。
    *   使用 `app.isPackaged` 检测运行环境（开发 vs. 打包）。
    *   在生产环境（打包后）加载 `file://` 协议的本地 HTML 文件。
*   **渲染进程 (Renderer Process)**:
    *   每个 Electron 窗口运行一个独立的渲染进程 (Chromium 环境)。
    *   用户界面 (UI) 使用 **React** 和 **TypeScript** 构建，UI 库为 **Ant Design**。
    *   入口 HTML：`src/renderer/index.html`。
    *   React 应用入口：`src/renderer/main.tsx`。
    *   使用 **Vite** 作为开发服务器和生产构建工具 (`vite build`)，输出到 `dist/renderer`。
*   **预加载脚本 (Preload Script)**:
    *   入口文件：`src/preload.ts` (编译后为 `dist/main/preload.js`)。
    *   在渲染进程加载网页前运行，桥接主进程和渲染进程。
    *   使用 `contextBridge` 安全地将主进程的 IPC 功能暴露给渲染进程（例如 `window.electronAPI.invoke(...)`），包含白名单机制限制可调用的通道。
*   **核心算法服务 (Python Backend)**:
    *   算法实现：`src/python/algorithm.py`。
    *   使用 Python 实现组合生成和优化逻辑，依赖 `ortools` 和 `numpy`。
    *   **不再直接操作数据库**，仅负责计算并将结果返回给主进程。
    *   通过 `python-shell` 库从 Node.js 主进程 (`run-handler.ts`) 中调用。
    *   在打包应用中，该脚本位于 `resources/app.asar.unpacked/dist/main/python/` 目录，以允许外部 Python 进程访问。
*   **Node.js 服务层 (Services)**:
    *   位于 `src/services/` 目录。
    *   `validator.ts`: 封装参数校验逻辑。
    *   `db.ts`: (如果存在) 可能包含一些辅助数据库函数，但主要的数据库交互逻辑已移至 `ipcHandlers`。

### 2.2 技术栈

*   **框架**: Electron, React
*   **语言**: TypeScript, Python, JavaScript, HTML, CSS
*   **UI 库**: Ant Design (`antd`)
*   **构建工具**: Vite (渲染进程), TypeScript Compiler (`tsc`) (主进程/预加载)
*   **打包工具**: electron-builder
*   **包管理器**: npm
*   **数据库**: SQLite (通过 `better-sqlite3` 在主进程中操作)
*   **Excel 导出**: `exceljs`
*   **进程间通信**: Electron IPC, `python-shell`
*   **核心算法库 (Python)**: Google OR-Tools (CP-SAT), NumPy
*   **UI 路由**: `react-router-dom`
*   **环境检测**: `app.isPackaged` (Electron API)

### 2.3 关键文件与目录说明

*   `optimal-samples-app final/` (项目根目录)
    *   `package.json`: 项目元数据、依赖、脚本 (`dev`, `build`, `package`, `rebuild`)。包含 `electron-builder` 的打包配置（如 `asarUnpack`）。
    *   `tsconfig.json`: 基础 TypeScript 配置。
    *   `tsconfig.main.json`: 主进程/预加载脚本的 TypeScript 配置。
    *   `vite.config.ts`: Vite 配置（渲染进程开发与构建）。
    *   `database/`: **运行算法后，生成的 SQLite 数据库结果文件 (.db) 将保存在此文件夹中。**
    *   `dist/`: 存放编译和构建输出。
        *   `main/`: 主进程和预加载脚本编译输出。
            *   `main/`: 存放编译后的主进程 `.js` 文件（包括 `ipcHandlers`）。
            *   `preload.js`: 编译后的预加载脚本。
            *   `python/`: 从 `src/python` 复制过来的 Python 脚本。
        *   `renderer/`: 渲染进程代码的生产构建输出 (by Vite)。
    *   `docs/`: 项目文档 (`user_manual.md`)。
    *   `node_modules/`: npm 依赖。
    *   `release/`: 打包后的应用程序安装文件（由 `npm run package` 生成）。
    *   `src/`: 源代码。
        *   `main/`: 主进程代码。
        *   `preload.ts`: 预加载脚本。
        *   `python/`: Python 算法脚本 (`algorithm.py`)。
        *   `renderer/`: 渲染进程 (UI) 代码。
        *   `services/`: Node.js 服务层 (`validator.ts`)。
        *   `shared/`: 共享代码 (`types.ts`)。

## 3. 安装与环境要求

### 3.1 环境要求:

*   **Node.js 和 npm**: 从 [https://nodejs.org/](https://nodejs.org/) 下载并安装 Node.js (建议 LTS 版本)。npm 会一同安装。
*   **Python**: 从 [https://www.python.org/](https://www.python.org/) 下载并安装 Python (建议 3.7 或更高版本)。**务必确保在安装时勾选 "Add Python to PATH" (添加到环境变量)**，或者手动配置好环境变量，使得在终端可以直接运行 `python` 命令。
*   **pip**: Python 包安装器，通常随 Python 一同安装。

### 3.2 安装 Python 依赖:

核心算法依赖 `numpy` 和 `ortools`。打开终端或命令提示符，运行：

```bash
pip install numpy ortools psutil
```
*注意*:
*   `psutil` 用于自动检测 CPU 核心数以优化 `workers` 参数，如果未安装，会回退到默认值。
*   根据系统配置可能需使用 `pip3`。

### 3.3 安装应用程序依赖:

1.  打开终端，进入项目根目录 (`optimal-samples-app final`)。
2.  运行 `npm install` 安装 Node.js 依赖（包括 `better-sqlite3`, `python-shell`, `exceljs` 等）。
3.  本项目使用了需要编译的原生 Node.js 模块 (`better-sqlite3`, `python-shell`)。依赖安装完成后，**必须**为 Electron 环境重新编译它们。运行：
    ```bash
    npm run rebuild
    ```

## 4. 运行应用程序 (开发模式)

1.  确保终端位于项目根目录。
2.  运行 `npm run dev`。

此命令会执行清理、编译、启动 Vite 开发服务器和 Electron 应用。稍等片刻，应用窗口就会出现，并加载 `http://localhost:5173`。

## 5. 使用应用程序

### 5.1 主页 (参数输入):

*   **输入参数**:
    *   **M**: 总样本数 (范围 45-54)。
    *   **N**: 初始样本数 (范围 7-25)。
    *   **K**: 目标组大小 (范围 4-7)。
    *   **J**: 覆盖检查子集大小 (s ≤ j ≤ k)。
    *   **S**: 内部覆盖子集大小 (3-7, 且 s ≤ j)。
    *   **T**: 覆盖阈值 (1 ≤ t ≤ j, 默认 1)。即每个 j-子集至少需要被 t 个选中的 k-组合覆盖。
*   **已选样本 (Selected Samples)**:
    *   手动输入 N 个用逗号分隔的数字（从 1 到 M）。
    *   或点击 “随机选择样本 (Random Select Samples)” 自动生成 N 个样本。
*   **高级设置 (Advanced Settings)**:
    *   **Workers (CPU核心数)**: （可选）指定求解器使用的 CPU 核心数。对于 `s == j` 情况，它控制 OR-Tools；对于 `s < j` 情况，它控制 Python 多进程评估的并行度。默认为系统核心数或自动检测。
    *   **Beam Width**: （可选）用于 `s < j` 贪心算法的 Beam Search 宽度，默认为 1 (标准贪心)。
*   点击 “生成最优组合 (Generate Optimal Groups)” 按钮启动计算。界面会显示进度条和状态信息。
*   计算完成后，如果成功，结果会自动保存到项目根目录下的 `database` 文件夹中，并生成一个唯一的 `.db` 文件名（例如 `45-7-6-5-5-1-run-1-6.db`），同时提示成功信息。失败则提示错误。

### 5.2 管理结果页 (Manage Results):

*   此页面列出项目 `database` 文件夹中的所有有效结果数据库文件 (`.db`)。
*   **刷新列表 (Refresh List)**: 重新扫描 `database` 文件夹。
*   **查看 (View)**: (带有眼睛图标) 点击后跳转到“查看结果”页面，显示该文件的详细内容。
*   **导出为 Excel (Export to Excel)**: (带有 Excel 图标) 点击后会提示用户选择保存位置，然后将该数据库文件的参数和组合数据导出为一个 `.xlsx` 文件。
*   **删除 (Delete)**: (带有垃圾桶图标) 点击后会弹出确认框，确认后永久删除选定的结果文件。

### 5.3 查看结果页 (Result Details):

*   此页面展示特定结果文件的详细信息：运行参数、使用的初始样本、最终选出的 k-组合列表。

## 6. 构建与安装发布版本

1.  确保所有依赖已正确安装并重新编译 (`npm install`, `npm run rebuild`)。
2.  运行打包命令： `npm run package`。
3.  打包完成后，在项目根目录的 `release` 文件夹中找到生成的 `.exe` 安装程序（或其他平台的对应文件）。
4.  运行该安装文件即可安装应用程序。安装后即可独立运行，无需开发环境。

## 7. 算法解释

核心目标是在给定条件下，找到覆盖所有指定子集的、数量最少的 K 元组合集合。算法实现在 `src/python/algorithm.py` 文件中，主要逻辑位于 `select_optimal_samples` 函数。

### 7.1 问题定义 (与之前版本一致)

给定参数 M, N, K, J, S, T 和 N 个初始样本 `samples` (从 1..M 中选取):
1.  生成所有可能的 K 元组合 `k_combos` (从 `samples` 中选取 K 个元素)。
2.  生成所有可能的 J 元子集 `j_subsets` (从 `samples` 中选取 J 个元素)。
3.  **目标**: 从 `k_combos` 中选择一个 **数量最少** 的子集 `selected_k_combos`。
4.  **约束**: 对于 **每一个** `j_subset`，它必须被 `selected_k_combos` 中的至少 `T` 个 k-组合所 **覆盖 (s-层级)**。
5.  **覆盖 (s-层级) 定义**: 一个 `k_combo` 覆盖一个 `j_subset` (在 s-层级)，当且仅当 `j_subset` 至少有一个 S 元子集，这个 S 元子集同时也是 `k_combo` 的一个 S 元子集。

### 7.2 算法选择

算法根据 `s` 和 `j` 的关系，采用不同的策略 (`select_optimal_samples` 函数)：

*   **情况 1: `s == j` (精确求解 - 阈值集合覆盖)**
    *   **问题转化**: 当 `s=j` 时，覆盖定义简化为：一个 `k_combo` 覆盖一个 `j_subset` 当且仅当 `j_subset` 是 `k_combo` 的一个子集。问题转化为经典的 **阈值集合覆盖 (Threshold Set Cover)** 问题。
    *   **K组合剪枝 (可选)**: 在求解前，如果 `utils.combo_prune.unique_k_combos` 工具可用，会先根据 s-子集签名对原始 `k_combos` 进行剪枝，去除那些对于覆盖 j-子集 (s=j) 冗余的 k-组合，以减少求解器负担。
    *   **求解器**: 使用 **Google OR-Tools** 库中的 **CP-SAT 约束规划求解器** (`_threshold_set_cover` 函数) 来精确求解此问题。
    *   **模型**:
        *   为每个（可能已剪枝的）`k_combo[i]` 创建一个布尔变量 `x[i]` (1=选中, 0=不选)。
        *   **目标函数**: 最小化 `sum(x[i])` (选中的 k-组合数量)。
        *   **约束**: 对每个 `j_subset`，找到所有包含它的 `k_combo` 的索引 `Needs`，添加约束 `sum(x[i] for i in Needs) >= t`。
    *   **求解优化**:
        *   **多核并行**: 利用 `workers` 参数指定 CP-SAT 求解器使用的 CPU 核心数。
        *   **时间限制**: `time_limit` 参数限制求解器的最大运行时间。
        *   **对称性破除**: 添加约束 (`x[i-1] >= x[i]`) 减少搜索空间。
        *   **Warm Start (可选)**: 可以提供一个初始解 (`warm_start_hints`) 来指导求解器，可能加速收敛。

*   **情况 2: `s < j` (贪心启发式算法 + 优化)**
    *   当 `s < j` 时，精确求解通常不可行。采用 **贪心启发式算法** (`_greedy_cover_partial` 函数) 来寻找近似最优解。
    *   **核心贪心策略**:
        1.  初始化空的结果集 `result_combos` 和未满足的 j-子集集合 `unsatisfied_j_subsets`。
        2.  **迭代**: 只要还有未满足的 `j_subsets`:
            *   计算每个 **未被选中** 的 `k_combo` 能 **新满足多少个** 当前 `unsatisfied_j_subsets`。
            *   选择那个能 **新满足最多** `j_subsets` 的 `k_combo` (即边际效用最大的)。
            *   将选中的 `k_combo` 加入 `result_combos`，并更新 `unsatisfied_j_subsets`。
        3.  重复迭代，直到所有 `j_subsets` 都被满足，或无法找到能满足更多 `j_subsets` 的 `k_combo`。
    *   **优化与选项**:
        *   **位掩码优化 (Bitmask)**: （默认启用，需 `utils.bitmask` 可用）使用 NumPy 位操作加速覆盖检查，显著提升 `s < j` 场景下的贪心迭代速度。
        *   **Beam Search**: `beam_width` 参数 (> 1) 允许在每步贪心选择时，保留多个候选 `k_combo` 而非仅保留最优的一个，扩展搜索范围，可能找到更好的解，但会增加计算时间。（当前代码中未完全实现 Beam Search 逻辑，参数存在但实际行为仍为标准贪心）。
        *   **2-Opt 优化**: 在贪心主循环结束后，如果所有 j-子集都已满足，则执行 2-Opt 局部搜索。随机选择已选中的两个 k-组合，尝试移除它们，如果剩余组合仍能满足所有覆盖要求，则确认移除，重复此过程一定次数，以尝试进一步减少结果集的大小。
    *   **注意**: 贪心算法及其优化不保证找到全局最优解，但旨在在合理时间内给出高质量的近似解。

### 7.3 进度报告与结果

*   **进度报告**: 算法执行过程中，通过 `report_progress` 函数打印 JSON 格式的进度信息（包含百分比、消息、已用时间）到标准输出 (`stdout`)。Electron 主进程捕获这些输出，并通过 IPC 将其转发给渲染进程以更新 UI。
*   **结果返回**: `select_optimal_samples` 函数执行完成后，返回一个包含详细信息的 Python 字典，并通过 `stdout` 打印为单行 JSON。该字典包含：
    *   所有输入参数 (m, n, k, j, s, t)
    *   使用的初始样本列表 `samples`
    *   计算出的（最优或近似最优）k-组合列表 `combos`
    *   算法总执行时间 `execution_time` (秒)
    *   实际使用的 CPU 工作线程数 `workers` (主要用于 s=j 时的 CP-SAT)

## 8. 开发过程中的挑战与解决方案 (概要)

*   **路径解析**: 开发环境与打包后环境的路径差异，通过 `app.isPackaged` 和 `__dirname`/`app.getAppPath()` 结合 `path.join` 解决。
*   **`asar` 压缩包**: 使用 `asarUnpack` 配置解压 Python 脚本，并在代码中调整路径访问 `.asar.unpacked`。
*   **环境检测**: 使用 `app.isPackaged` 代替 `process.env.NODE_ENV` 进行可靠的环境判断。
*   **原生 Node.js 模块**: 使用 `electron-rebuild` (通过 `npm run rebuild`) 重新编译以适配 Electron 的 Node.js 版本。
*   **数据库路径统一**: 将数据库操作（包括保存）集中到主进程，并使用统一的路径逻辑指向项目内的 `database` 文件夹。

## 9. 故障排除

*   **应用空白/无法加载**: 检查 Vite 服务、打包配置、`index.ts` 加载逻辑、DevTools 控制台。
*   **Python 脚本错误**: 确认 Python 和依赖安装、`run-handler.ts` 路径计算、`asarUnpack` 配置及路径处理。
*   **结果文件未找到/未列出**:
    *   检查 `database` 文件夹是否存在于项目根目录。
    *   确认 `db-handler.ts` 和 `run-handler.ts` 中的 `dbDir` 路径逻辑是否正确。
    *   确认 `db-handler.ts` 中 `list-db-files` 的正则表达式是否能匹配实际生成的文件名格式。
*   **数据库错误**: 确认文件系统权限、`better-sqlite3` 是否正确编译 (`npm run rebuild`)。
*   **Excel 导出失败**: 确认 `exceljs` 已安装、IPC 通道已暴露 (`preload.ts`)、主进程处理器逻辑无误、目标保存位置有写入权限。

## 10. 性能说明与基准测试 (Performance Notes & Benchmarking)

### 10.1 性能提示

核心算法根据 `s` 和 `j` 的关系采用不同策略，其性能特点如下：

*   **CP-SAT (`s=j` 情况)**:
    *   此为精确求解器，性能受益于 K 组合剪枝 (`utils.combo_prune`) 和对称性破除约束。
    *   `workers` 参数（CPU核心数）对性能有影响，系统默认会根据物理核心数自动检测（*1.5 倍），但用户可以通过高级设置覆盖。
*   **贪心启发式 (`s<j` 情况)**:
    *   此为近似算法，默认使用 NumPy 位掩码（Bitmask）加速覆盖检查，比纯 Python 集合操作更快。
    *   2-Opt 优化有助于在贪心结束后进一步减少结果组合数量。

### 10.2 基准测试 (Benchmark)

项目包含一个基准测试脚本 (`bench/bench.py`)，用于评估不同参数下的算法性能。

*   **测试设置**: (`docs/benchmark.md` 中的信息) 基准测试通常在固定参数（如 `t=1`, `workers=4`, `time_limit=60s`）下，对特定范围内的参数组合进行多次随机运行（例如 20 次）来收集数据。
*   **记录指标**: 测试会记录执行时间 (`execution_time`)、求解器时间 (`solver_time`，仅 CP-SAT)、最终组合数量 (`num_combos`) 等关键指标。
*   **结果文件**: 优化前后的原始基准测试数据分别保存在项目根目录下的 `benchmark_results.csv` 和 `benchmark_results_optimized.csv` 文件中。详细的性能对比分析（如图表和文字说明）原本计划放在 `docs/benchmark.md`，但该文件现已合并至此并计划删除。
*   **初步结果 (来自 README)**: 简单的测试显示，对于特定参数示例，CP-SAT (`s=j`) 可能非常快（例如 ~31ms），而贪心算法 (`s<j`) 则相对耗时（例如 ~614ms），具体时间会根据问题的规模、复杂度以及硬件环境变化。

---
希望这份更新后的文档能帮助您更好地理解和使用本系统！
