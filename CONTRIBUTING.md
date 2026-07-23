# 参与贡献

感谢你改进 Course Detail Image Skills。请让每次变更保持小而清晰，并确保 Skill 的触发条件、操作边界和验证方式可复现。

## 开发流程

1. 从 `main` 创建短期分支。
2. 修改 Skill、脚本或仓库文档。
3. 如果修改了 Skill 目录中的文件，运行 `python3 scripts/update_checksums.py`。
4. 运行 `python3 scripts/validate_repository.py`。
5. 在 `CHANGELOG.md` 的 `Unreleased` 下记录面向使用者的变化。
6. 提交 Pull Request，并说明变更动机、验证结果和兼容性影响。

## Skill 约定

- 目录名和 `SKILL.md` 的 `name` 必须一致，并使用小写 kebab-case。
- `SKILL.md` frontmatter 只包含 `name` 和 `description`。
- `description` 同时说明能力和触发场景；正文只写执行所需的流程与约束。
- 使用祈使句，避免向模型重复常识。
- `SKILL.md` 尽量控制在 500 行以内；详细规范放入一层深度的 `references/`。
- 可复用、要求确定性的逻辑放入 `scripts/`，并提供明确的 CLI 用法。
- `agents/openai.yaml` 的 `default_prompt` 必须显式包含 `$skill-name`。
- Skill 目录内不要添加 README、CHANGELOG、安装指南或其他仓库级文档。

## 测试

至少完成以下检查：

```bash
python3 scripts/validate_repository.py
```

修改 `embed-real-images.cjs` 时，还应使用一组非敏感测试图片验证：

- 矩形槽位的 `cover` 裁切；
- 四点透视的边缘和圆角；
- `protect` 遮挡恢复；
- 输出尺寸和文字清晰度。

不要把测试所用的客户素材或生成结果提交到仓库。

## 提交与版本

提交消息使用约定式提交格式，例如：

```text
feat: 增加多槽位比例验收
fix: 修复透视嵌图边缘露底
docs: 完善插件安装说明
```

破坏兼容性的 Skill 重命名或工作流变化需要提升主版本；新增向后兼容能力提升次版本；修复提升修订版本。
