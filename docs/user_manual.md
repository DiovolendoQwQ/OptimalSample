# 最优样本选择系统 - 用户手册

## 1. 简介

欢迎使用最优样本选择系统。本应用程序旨在解决一个特定的组合优化问题：给定一个包含 `m` 个总样本的集合，从中选取 `n` 个初始样本，然后需要找到一个 **最小数量** 的、每个包含 `k` 个样本的组（称为 k-组合），这个组集合需要满足特定的覆盖要求。

覆盖要求是针对所有从 `n` 个初始样本中选出的、包含 `j` 个样本的子集（称为 j-子集）来定义的。对于每一个 j-子集，我们需要其内部包含的、由 `s` 个样本构成的子集（称为 s-子集），至少被我们选出的 k-组合集合中的 `t` 个（阈值）所“覆盖”。“覆盖”的定义是：一个 k-组合覆盖一个 j-子集（在 s-层级上），当且仅当这个 j-子集至少有一个 s-子集，同时也是这个 k-组合的一个 s-子集。

本系统提供了一个图形用户界面 (GUI)，允许用户输入参数（m, n, k, j, s, t）和初始样本列表，然后调用后端 Python 算法计算出满足条件的最优（或近似最优）k-组合集合，并将结果保存到数据库以供后续查看和管理。

该软件基于 Electron 框架开发，结合了 React (使用 Vite 构建) 构建用户界面，并调用 Python 脚本执行核心的组合优化计算。

## 2. 软件架构与技术栈

### 2.1 软件架构

本应用程序采用标准的 **Electron** 架构，结合 **Python** 后端进行核心算法处理，具体分为以下几个主要部分：

*   **主进程 (Main Process)**:
    *   由 Electron 负责启动和管理。
    *   入口文件：`src/main/index.ts` (编译后为 `dist/main/main/index.js`)。
    *   职责：创建和管理应用程序窗口 (`BrowserWindow`)、处理原生操作系统事件、协调渲染进程和后端服务、管理所有 IPC (进程间通信) 逻辑。
    *   IPC 处理程序位于 `src/main/ipcHandlers/` 目录下（例如 `run-handler.ts`, `db-handler.ts`），负责响应来自渲染进程的请求。
    *   使用 `app.isPackaged` 检测运行环境（开发 vs. 打包）。
    *   在生产环境（打包后）加载 `file://` 协议的本地 HTML 文件。
*   **渲染进程 (Renderer Process)**:
    *   每个 Electron 窗口运行一个独立的渲染进程 (Chromium 环境)。
    *   用户界面 (UI) 使用 **React** 和 **TypeScript** 构建。
    *   入口 HTML：`src/renderer/index.html`。
    *   React 应用入口：`src/renderer/main.tsx`。
    *   使用 **Vite** 作为开发服务器和生产构建工具 (`vite build`)，输出到 `dist/renderer`。Vite 配置了 `base: './'` 以生成正确的相对资源路径。
*   **预加载脚本 (Preload Script)**:
    *   入口文件：`src/preload.ts` (编译后为 `dist/main/preload.js`)。
    *   在渲染进程加载网页前运行，桥接主进程和渲染进程。
    *   使用 `contextBridge` 安全地将主进程的 IPC 功能暴露给渲染进程（例如 `window.electronAPI.invoke(...)`）。
*   **核心算法服务 (Python Backend)**:
    *   算法实现：`src/python/algorithm.py`。
    *   使用 Python 实现组合生成和优化逻辑，依赖 `ortools` 和 `numpy`。
    *   通过 `python-shell` 库从 Node.js 主进程 (`run-handler.ts`) 中调用。
    *   在打包应用中，该脚本位于 `resources/app.asar.unpacked/dist/main/python/` 目录，以允许外部 Python 进程访问。
*   **Node.js 服务层 (Services)**:
    *   位于 `src/services/` 目录。
    *   `validator.ts`: 封装参数校验逻辑。
    *   `db.ts`: 封装数据库交互逻辑，使用 `better-sqlite3` 操作 SQLite。 **注意：现在结果数据库保存在用户桌面上的 "Optimal Samples Results" 文件夹中。**

### 2.2 技术栈

*   **框架**: Electron, React
*   **语言**: TypeScript, Python, JavaScript, HTML, CSS
*   **构建工具**: Vite (渲染进程), TypeScript Compiler (`tsc`) (主进程/预加载)
*   **打包工具**: electron-builder
*   **包管理器**: npm
*   **数据库**: SQLite (通过 `better-sqlite3`)
*   **进程间通信**: Electron IPC, `python-shell`
*   **核心算法库 (Python)**: Google OR-Tools (CP-SAT), NumPy
*   **UI 路由**: `react-router-dom`
*   **环境变量**: `cross-env` (用于构建脚本), `app.isPackaged` (用于运行时检测)

### 2.3 关键文件与目录说明

*   `optimal-samples-app azb/` (项目根目录)
    *   `package.json`: 项目元数据、依赖、脚本 (`dev`, `build`, `package`, `rebuild`)。包含 `electron-builder` 的打包配置（如 `asarUnpack`）。
    *   `tsconfig.json`: 基础 TypeScript 配置。
    *   `tsconfig.main.json`: 主进程/预加载脚本的 TypeScript 配置。
    *   `vite.config.ts`: Vite 配置（渲染进程开发与构建）。
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
        *   `services/`: Node.js 服务层 (`db.ts`, `validator.ts`)。
        *   `shared/`: 共享代码 (`types.ts`)。
    *   **用户桌面**:
        *   `Optimal Samples Results/`: **运行算法后，生成的 SQLite 数据库结果文件 (.db) 将保存在此文件夹中。**

## 3. 安装与环境要求

### 3.1 环境要求:

*   **Node.js 和 npm**: 从 [https://nodejs.org/](https://nodejs.org/) 下载并安装 Node.js (建议 LTS 版本)。npm 会一同安装。
*   **Python**: 从 [https://www.python.org/](https://www.python.org/) 下载并安装 Python (建议 3.7 或更高版本)。**务必确保在安装时勾选 "Add Python to PATH" (添加到环境变量)**，或者手动配置好环境变量，使得在终端可以直接运行 `python` 命令。
*   **pip**: Python 包安装器，通常随 Python 一同安装。

### 3.2 安装 Python 依赖:

核心算法依赖 `numpy` 和 `ortools`。打开终端或命令提示符，运行：

```bash
pip install numpy ortools
```
*注意*: 根据系统配置可能需使用 `pip3`。

### 3.3 安装应用程序依赖:

1.  打开终端，进入项目根目录 (`optimal-samples-app azb`)。
2.  运行 `npm install` 安装 Node.js 依赖。
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
*   **工作线程数 (Workers)**: （可选）指定 Python 求解器使用的 CPU 核心数，默认为系统核心数。
*   点击 “生成最优组 (Generate Optimal Groups)” 按钮启动计算。界面会显示进度条和状态信息。
*   计算完成后，如果成功，结果会自动保存到 **用户桌面** 的 `Optimal Samples Results` 文件夹下的一个新的 `.db` 文件中，并提示成功信息。失败则提示错误。

### 5.2 管理结果页 (Manage Results / DB Manager):

*   此页面（如果实现）会列出 **用户桌面** `Optimal Samples Results` 文件夹中的所有结果数据库文件 (`.db`)。
*   **查看 (View)**: 打开并查看选定结果文件的内容。
*   **删除 (Delete)**: 删除选定的结果文件。
*   **刷新列表 (Refresh List)**: 重新扫描结果文件夹。

### 5.3 结果详情页 (Result Details):

*   此页面（如果实现）展示特定结果文件的详细信息：使用的参数、初始样本、最终选出的 k-组合列表。

## 6. 构建与安装发布版本

1.  确保所有依赖已正确安装并重新编译 (`npm install`, `npm run rebuild`)。
2.  运行打包命令： `npm run package`。
3.  打包完成后，在项目根目录的 `release` 文件夹中找到生成的 `.exe` 安装程序（例如 `Optimal Samples App Setup 1.0.0.exe`）。
4.  运行该 `.exe` 文件即可安装应用程序。安装后即可独立运行，无需开发环境。

## 7. 算法解释

核心目标是找到满足特定覆盖条件的最小 k-组合集合。算法在 `src/python/algorithm.py` 中实现，主要逻辑在 `select_optimal_samples` 函数内。

### 7.1 问题定义

给定参数 M, N, K, J, S, T 和 N 个初始样本 `samples` (从 1..M 中选取):
1.  生成所有可能的 K 元组合 `k_combos` (从 `samples` 中选取 K 个元素)。
2.  生成所有可能的 J 元子集 `j_subsets` (从 `samples` 中选取 J 个元素)。
3.  **目标**: 从 `k_combos` 中选择一个 **数量最少** 的子集 `selected_k_combos`。
4.  **约束**: 对于 **每一个** `j_subset`，它必须被 `selected_k_combos` 中的至少 `T` 个 k-组合所 **覆盖 (s-层级)**。
5.  **覆盖 (s-层级) 定义**: 一个 `k_combo` 覆盖一个 `j_subset` (在 s-层级)，当且仅当 `j_subset` 至少有一个 S 元子集，这个 S 元子集同时也是 `k_combo` 的一个 S 元子集。

### 7.2 算法选择

算法根据 `s` 和 `j` 的关系选择不同的策略：

*   **情况 1: `s == j` (阈值集合覆盖问题)**
    *   当 `s=j` 时，覆盖定义简化为：一个 `k_combo` 覆盖一个 `j_subset` 当且仅当 `j_subset` 是 `k_combo` 的一个子集。
    *   问题转化为一个经典的 **阈值集合覆盖 (Threshold Set Cover)** 问题：选择最少的集合 (`k_combos`)，使得每个元素 (`j_subsets`) 至少被 `t` 个选中的集合所包含。
    *   此问题使用 **Google OR-Tools** 库中的 **CP-SAT 约束规划求解器** (`ortools.sat.python.cp_model`) 来精确求解。
    *   **模型**:
        *   为每个 `k_combo[i]` 创建一个布尔变量 `x[i]` (1 代表选中，0 代表不选)。
        *   **目标函数**: 最小化 `sum(x[i])` (选中的 k-组合数量)。
        *   **约束**: 对于每个 `j_subset`，计算出所有包含它的 `k_combo` 的索引 `Needs`，然后添加约束 `sum(x[i] for i in Needs) >= t`。
    *   求解器会利用多核 CPU (`workers` 参数) 在给定的时间限制 (`time_limit` 参数) 内寻找最优解。

*   **情况 2: `s < j` (贪心启发式算法)**
    *   当 `s < j` 时，覆盖的判断变得复杂，精确求解的计算量巨大。因此采用 **贪心启发式算法** (`_greedy_cover_partial`) 来寻找一个近似最优解。
    *   **策略**:
        1.  初始化空的结果集 `result` 和已满足的 j-子集集合 `satisfied_j_subsets`。
        2.  预先计算每个 k-组合包含的所有 s-子集，以及每个 j-子集包含的所有 s-子集。
        3.  维护一个当前所有已选 k-组合共同覆盖的 s-子集总集 `covered_s_subsets_overall`。
        4.  **迭代**: 只要还有未满足的 `j_subsets`:
            *   遍历所有 **未被选中** 的 `k_combos`。
            *   对于每个 `k_combo`，计算如果将它加入 `result`，**能够新满足多少个** 当前未满足的 `j_subsets`。（一个 `j_subset` 在此步骤被视为满足，如果它的某个 s-子集被 **当前 `k_combo` 的 s-子集** 所包含）。*（注意：原代码逻辑似乎是检查是否被*累积*覆盖集满足，但贪心选择步骤应关注单个 `k_combo` 的边际贡献）* - **更正：原代码逻辑是正确的，计算单个k_combo能满足多少个当前*未满足*的j_subset**。
            *   选择那个能 **新满足最多** `j_subsets` 的 `k_combo` (即边际效用最大的)。
            *   将选中的 `k_combo` 加入 `result`。
            *   更新 `covered_s_subsets_overall`。
            *   重新检查所有 `j_subsets`，更新 `satisfied_j_subsets` 集合（包含所有至少有一个 s-子集被 `covered_s_subsets_overall` 覆盖的 j-子集）。
        5.  重复迭代，直到所有 `j_subsets` 都被满足，或者无法找到能满足更多 `j_subsets` 的 `k_combo`。
    *   **注意**: 贪心算法不保证找到全局最优解（最小数量的 k-组合），但通常能在合理时间内给出一个较好的解。

### 7.3 进度报告与结果

*   算法执行过程中，通过 `report_progress` 函数打印 JSON 格式的进度信息到标准输出，Electron 主进程捕获这些信息并通过 IPC 发送给渲染进程显示。
*   最终返回一个包含所有输入参数、选取的初始样本 `samples`、计算出的最优（或近似最优）k-组合列表 `combos`、算法执行时间 `execution_time` 和使用的 `workers` 数量的字典。

## 8. 开发过程中的挑战与解决方案

在开发此应用程序的过程中，遇到了一些与 Electron、打包和跨语言调用相关的典型挑战：

*   **路径解析 (Path Resolution)**:
    *   **问题**: 在开发模式下，`__dirname` 指向 `.ts` 文件所在的 `src` 目录结构；而在编译/打包后，它指向 `.js` 文件所在的 `dist` 或 `app.asar` 内的目录结构（且 `tsc` 可能保留了源目录结构，如 `dist/main/main/ipcHandlers`）。这导致在不同环境下，计算相对路径（如指向 `preload.js`, `python/algorithm.py`, `renderer/index.html`）非常困难且容易出错。
    *   **解决方案**:
        *   **预加载脚本**: 最终确定 `__dirname` 指向 `dist/main/main/index.js` (或其同级 `ipcHandlers`)，因此需要 `path.join(__dirname, '../preload.js')`。
        *   **Python 脚本**: 确定 `__dirname` 指向 `dist/main/main/ipcHandlers`，因此需要 `path.join(__dirname, '../../python/algorithm.py')`。
        *   **渲染器 HTML (生产环境)**: 使用 `app.getAppPath()` 获取应用根目录（在打包后是 `resources/app.asar` 或解压后的根目录），然后使用 `path.join(app.getAppPath(), 'dist/renderer/index.html')` 构建绝对路径。并使用 `mainWindow.loadURL()` 加载对应的 `file://` URL。

*   **`asar` 压缩包与外部进程**:
    *   **问题**: 默认情况下，`electron-builder` 会将应用程序代码和资源打包进 `app.asar` 压缩文件。然而，外部进程（如此处由 `python-shell` 启动的 `python` 解释器）无法直接读取 `asar` 包内的文件。
    *   **解决方案**: 在 `package.json` 的 `build` 配置中，使用 `asarUnpack` 选项指定需要从 `asar` 包中解压出来的文件或目录。对于本项目，添加了 `"asarUnpack": ["dist/main/python/**/*"]`。同时，在主进程代码 (`run-handler.ts`) 中，当检测到是打包环境 (`app.isPackaged`) 时，需要将计算出的脚本路径中的 `app.asar` 替换为 `app.asar.unpacked`，以指向实际解压出来的文件。

*   **环境检测 (Development vs. Production)**:
    *   **问题**: 依赖 `process.env.NODE_ENV` 来判断运行环境在 Electron 主进程中不可靠，尤其是在打包后，该环境变量可能未按预期设置为 `production`。这导致打包后的应用错误地尝试加载开发服务器 URL (`http://localhost:5173`)。
    *   **解决方案**: 使用 Electron 内建的 `app.isPackaged` 布尔属性。它能在运行时准确判断应用程序是否从打包后的文件中运行。代码中使用 `const isDev = !app.isPackaged;`。

*   **原生 Node.js 模块**:
    *   **问题**: 项目依赖了 `better-sqlite3` 和 `python-shell`，这些模块包含需要针对特定 Node.js 版本和操作系统编译的 C++ 代码。直接 `npm install` 安装的是用于标准 Node.js 环境的预编译版本，与 Electron 内嵌的 Node.js 版本不兼容。
    *   **解决方案**: 在 `npm install` 之后，必须运行 `npm run rebuild` (或 `yarn rebuild`) 命令。该命令使用 `electron-rebuild` 工具，根据当前安装的 Electron 版本，重新编译项目中的所有原生模块。

## 9. 故障排除

*   **应用空白/无法加载**:
    *   检查开发模式下 Vite 服务器 (`npm run dev`) 是否正常启动。
    *   检查打包后 (`npm run package`) 是否所有文件都被正确包含（`electron-builder` 配置）。
    *   检查 `src/main/index.ts` 中加载渲染器 URL (`rendererUrl`) 的逻辑是否正确（开发 vs. 生产）。
    *   检查 DevTools 的 Console 和 Network 标签页是否有错误。
*   **Python 脚本错误 (`ERR_FILE_NOT_FOUND` 或其他)**:
    *   确认 Python 已正确安装并添加到系统 PATH。
    *   确认 Python 依赖 (`numpy`, `ortools`) 已通过 `pip install` 安装。
    *   检查 `src/main/ipcHandlers/run-handler.ts` 中计算 Python 脚本路径 (`fullScriptPath`) 的逻辑。
    *   检查打包后 (`npm run package`)，`package.json` 中 `asarUnpack` 配置是否正确，并且 `run-handler.ts` 中是否正确处理了 `.asar.unpacked` 路径替换。
*   **数据库错误**:
    *   确认桌面有创建 `Optimal Samples Results` 文件夹的权限。
    *   检查 `src/services/db.ts` 中数据库路径 (`dbDir`) 是否正确指向桌面文件夹。
    *   确保 `better-sqlite3` 原生模块已通过 `npm run rebuild` 正确编译。

---
希望这份详细的文档能帮助您更好地理解和使用本系统！
