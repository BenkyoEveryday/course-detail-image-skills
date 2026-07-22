# 课程详情图生成团队插件

本仓库用于长期、多成员分发课程详情图生成工作流。插件包含两个原样复制的技能：

- `详情图生成`：解析 Word 或 ZIP 需求、建立页面映射、生成视觉稿并执行比例验收。
- `embed-real-images-no-ps`：确定性嵌入真实课件、教案、导学案和其他文字敏感图片。

## 完整性原则

`plugins/course-detail-image-generator/skills/` 下的技能文件来自本机已验证版本，封装时未修改任何技能内容。`SKILL-CHECKSUMS.sha256` 记录插件内全部技能文件的 SHA-256，可用于发布前后核验。

## 团队安装

1. 将本仓库提交到团队 Git 仓库并克隆到本地。
2. 添加此仓库为本地 marketplace：

   ```bash
   codex plugin marketplace add /absolute/path/to/course-detail-image-plugin-repo
   ```

3. 安装插件：

   ```bash
   codex plugin add course-detail-image-generator@course-detail-team
   ```

4. 新建 Codex 任务，并使用以下表达触发：

   ```text
   使用详情图生成技能，根据这份 Word 需求文档生成课程详情图。
   ```

## 发布与更新

- 使用语义化版本：`主版本.次版本.修订版本`。
- 每次发布创建 Git Tag，例如 `v1.0.0`。
- 修改技能前先在源技能仓库评审；同步到插件后重新生成校验和并运行插件验证。
- 不向仓库提交客户 Word、课件截图、生成结果、账号信息或其他敏感素材。
- 更新安装后使用新任务测试，避免旧任务继续使用缓存版本。

## 验证

在仓库根目录运行：

```bash
python3 /path/to/plugin-creator/scripts/validate_plugin.py plugins/course-detail-image-generator
shasum -a 256 -c SKILL-CHECKSUMS.sha256
```
