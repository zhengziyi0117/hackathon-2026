# 项目文档

文档入口更新：2026-10-14。制作规则按主题存放在通用 Markdown 中；历史版本记录单独归档。新任务从下表的制作指南和地图工作流开始，不需要特定编辑器配置。

| 想了解什么 | 文档 |
| --- | --- |
| 项目介绍、体验链接、快速启动 | [根目录 README](../README.md) |
| 开发者与 Agent 的统一协作入口 | [AGENTS.md](../AGENTS.md) |
| 新增景区、景点、风格与单景点世界 | [三维景区与景点制作指南](三维景区与景点制作指南.md) |
| 一个景区一个包、素材归属、构建与旧版本兼容 | [景区内容包规范](景区内容包规范.md) |
| 地图四层数据包、Schema、生成与验收流程 | [地图数据包与 Agent 工作流](地图数据包与Agent工作流.md) |
| 故宫原始设计与体验目标 | [故宫景区设计方案](../scenics/forbidden-city/docs/故宫景区设计方案.md) |
| 游客与景区人员如何使用，哪些环节是模拟 | [产品与景区工作流](产品与景区工作流.md) |
| 模块划分、状态、存储与真实生成记录 | [技术与服务](技术与服务.md) |
| 本地开发、服务配置、公开部署与故障处理 | [开发与部署](开发与部署.md) |
| 五分钟演示、评委问答、下一步验收 | [比赛与演示](比赛与演示.md) |
| 图片、模型、作者、许可与变化说明 | [素材与来源](../scenics/westlake/docs/素材与来源.md) |
| 版本演进与上线修复 | [更新记录](../CHANGELOG.md) |

- [故宫制作与验收](../scenics/forbidden-city/docs/故宫制作与验收.md)：第二个景区、v2 物理通行与视觉改造。
- [故宫素材来源](../scenics/forbidden-city/docs/故宫素材来源.md)：12 张实景图的作者、许可与事实资料。
- [故宫绘卷生成提示词](../scenics/forbidden-city/docs/故宫绘卷生成提示词.txt)：ImageGen 输入和使用范围。

## 图像与模型证据

- [真实景点与生成提示词](../scenics/westlake/docs/真实景点与生成提示词.md)：地图、左侧、右侧和近景补图。
- [背面与俯视补图提示词](../scenics/westlake/docs/背面与俯视补图提示词.md)：另外两张补图及推测范围。
- [早期概念图提示词](../scenics/westlake/docs/imagegen-prompt.txt)。
- [照片来源清单](../scenics/westlake/provenance/photo-sources.json)。
- [御碑亭真实生成记录](../scenics/westlake/spots/huagang/worlds/huagang-generation.json)。
- [御碑亭资产、网页副本与哈希](../scenics/westlake/spots/huagang/assets.json)。

## 历史交付物

[西湖微缩地图制作记录](history/西湖微缩地图制作记录.md) 保留 `95eed47` 的实现过程，其中旧路径与硬编码步骤不再用于新任务。

[漫游修订核验](../scenics/westlake/docs/漫游修订核验.txt)、[早期 PPTX](路演/景见-参赛路演.pptx)、[早期 PDF](路演/景见-路演稿.pdf) 保留用于追溯。它们记录较早版本，不应替代当前工作流说明。

文档随代码一起维护：功能变更更新相关说明，影响演示的变化更新演示脚本，实际发布结果进入更新记录。使用“已实现”“模拟”“待验证”描述真实状态，不把规划写成已经完成的能力。
