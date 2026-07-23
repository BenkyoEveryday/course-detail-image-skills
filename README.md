# 课程详情图生成团队插件

本仓库用于长期、多成员分发课程详情图生成工作流。插件包含两个原样复制的技能：

- `详情图生成`：解析 Word 或 ZIP 需求、建立页面映射、生成视觉稿并执行比例验收。
- `embed-real-images-no-ps`：确定性嵌入真实课件、教案、导学案和其他文字敏感图片。

## 完整性原则

`plugins/course-detail-image-generator/skills/` 下的技能文件来自本机已验证版本，封装时未修改任何技能内容。`SKILL-CHECKSUMS.sha256` 记录插件内全部技能文件的 SHA-256，可用于发布前后核验。

## 安装

### 交给 Codex Agent 安装（推荐）

把下面这句话直接发送给 Codex Agent：

```text
请安装这个公开 GitHub 仓库里的 Codex 插件，并在安装完成后告诉我如何开始使用：
https://github.com/BenkyoEveryday/course-detail-image-skills
```

Agent 应依次将该 GitHub 仓库添加为 marketplace，并安装其中的
`course-detail-image-generator` 插件。仓库根目录已经包含 Codex 可识别的
`.agents/plugins/marketplace.json`，不需要用户先克隆仓库或查找本地路径。

安装完成后，请新建一个 Codex 任务，让新任务加载刚安装的 skills。可以用下面的提示词开始：

```text
使用详情图生成技能，根据这份 Word 需求文档生成课程详情图。
```

### 手动安装

在终端执行：

```bash
codex plugin marketplace add https://github.com/BenkyoEveryday/course-detail-image-skills --ref main
codex plugin add course-detail-image-generator@course-detail-team
```

第一条命令直接读取公开 GitHub 仓库，无需提前执行 `git clone`、登录 GitHub 或配置 SSH 密钥。第二条命令会安装插件及其包含的两个 skills。

## 更新已安装的插件

仓库发布新版本后，在终端执行：

```bash
codex plugin marketplace upgrade course-detail-team
codex plugin add course-detail-image-generator@course-detail-team
```

更新完成后新建 Codex 任务，以确保任务使用最新版本。

## 发布与更新

- 使用语义化版本：`主版本.次版本.修订版本`。
- 每次发布创建 Git Tag，例如 `v1.0.0`。
- 修改技能前先在源技能仓库评审；同步到插件后重新生成校验和并运行插件验证。
- 不向仓库提交客户 Word、课件截图、生成结果、账号信息或其他敏感素材。
- 更新安装后使用新任务测试，避免旧任务继续使用缓存版本。

## 验证

维护者克隆仓库后，可在仓库根目录核验技能文件是否与发布版本一致：

```bash
shasum -a 256 -c SKILL-CHECKSUMS.sha256
```
