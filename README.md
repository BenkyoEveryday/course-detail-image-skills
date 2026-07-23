# Course Detail Image Skills

[![Validate repository](https://github.com/BenkyoEveryday/course-detail-image-skills/actions/workflows/validate.yml/badge.svg)](https://github.com/BenkyoEveryday/course-detail-image-skills/actions/workflows/validate.yml)
[![Latest release](https://img.shields.io/github/v/release/BenkyoEveryday/course-detail-image-skills)](https://github.com/BenkyoEveryday/course-detail-image-skills/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

一套可安装、可复用、可验证的 Codex Skills，用于把结构化课程需求生成商品封面与详情图，并将课件截图、教案页面等真实素材无损嵌入视觉稿。

## 包含的 Skills

| Skill | 作用 | 典型触发方式 |
| --- | --- | --- |
| [`generate-course-detail-images`](plugins/course-detail-image-generator/skills/generate-course-detail-images/SKILL.md) | 解析 Word 或 Markdown 素材包，建立页面映射和比例契约，经确认后逐页生成详情图 | “使用详情图生成技能，根据这份 Word 生成课程详情图” |
| [`embed-real-images-no-ps`](plugins/course-detail-image-generator/skills/embed-real-images-no-ps/SKILL.md) | 不经过 Photoshop 或 AI 重绘，把真实图片确定性嵌入矩形或透视占位 | “把这些课件截图无损嵌入视觉稿” |

两个 Skills 组成一条完整工作流：

```text
需求文档 / 素材包
  → 页面映射与风格确认
  → image2 逐页生成占位视觉稿
  → 占位比例验收
  → 确定性嵌入真实素材
  → 最终视觉检查
```

## 特点

- 严格区分“直接参与生图的素材”和“需要保真嵌入的真实占位图”。
- 在生图前锁定页序、文案、槽位数量和比例，避免批量生成后返工。
- 真实截图只做缩放、裁切、透视和图层合成，不交给图像模型重绘。
- 支持正视矩形以及手机、平板、书页等四点透视区域。
- 仓库内置零第三方 Python 依赖的结构校验、脚本语法检查和 SHA-256 完整性检查。

## 安装

要求使用支持 `codex plugin` 的 Codex CLI。

```bash
codex plugin marketplace add BenkyoEveryday/course-detail-image-skills --ref main
codex plugin add course-detail-image-generator@course-detail-team
```

也可以直接把下面这句话发送给 Codex：

```text
请从 https://github.com/BenkyoEveryday/course-detail-image-skills 安装
course-detail-image-generator 插件，并告诉我如何开始使用。
```

安装后请新建一个 Codex 任务，让新任务加载刚安装的 Skills。

## 快速开始

生成课程详情图：

```text
使用 $generate-course-detail-images，根据这份 Word 需求文档生成课程详情图。
先解析需求并给出页面映射、风格方向和素材比例契约，等我确认后再生成。
```

只嵌入真实素材：

```text
使用 $embed-real-images-no-ps，把这些课件截图嵌入视觉稿中的对应占位。
保留边框、标题、遮挡物和截图文字，不要让 AI 重绘截图。
```

第一项 Skill 在页面映射与风格方向确认前不会调用图像生成工具。这是工作流的安全门槛，不是异常停顿。

## 更新

```bash
codex plugin marketplace upgrade course-detail-team
codex plugin add course-detail-image-generator@course-detail-team
```

更新后新建 Codex 任务，避免旧任务继续使用缓存版本。

## 仓库结构

```text
.
├── .agents/plugins/marketplace.json
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/validate.yml
├── plugins/course-detail-image-generator/
│   ├── .codex-plugin/plugin.json
│   └── skills/
│       ├── generate-course-detail-images/
│       └── embed-real-images-no-ps/
├── scripts/
│   ├── update_checksums.py
│   └── validate_repository.py
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── SECURITY.md
└── SKILL-CHECKSUMS.sha256
```

仓库级文档位于根目录；每个 Skill 目录只保留运行该 Skill 必需的 `SKILL.md`、`agents/`、`scripts/`、`references/` 或 `assets/`。

## 验证

运行完整校验：

```bash
python3 scripts/validate_repository.py
```

只检查校验和是否需要更新：

```bash
python3 scripts/update_checksums.py --check
```

修改 Skill 文件后重新生成校验和：

```bash
python3 scripts/update_checksums.py
```

CI 会对每次推送和 Pull Request 执行相同检查。

## 参与维护

提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。发布使用语义化版本，并在 [CHANGELOG.md](CHANGELOG.md) 中记录面向使用者的变化。

请勿提交客户 Word、课件截图、生成结果、账号信息或其他敏感素材。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## License

[MIT](LICENSE) © 2026 Course Content Team
