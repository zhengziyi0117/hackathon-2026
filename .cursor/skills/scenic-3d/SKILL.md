---
name: scenic-3d
description: >-
  景见里两种三维的真实做法：单景点照片生成的 3D 世界（World Labs Marble SPZ），以及西湖微缩大地图（OpenStreetMap + Three.js）。
  说明新增景点实际有哪些文件槽位、哪些不会自动出现。在用户要求生成 3D 世界、3D 大地图、新景区三维地图、新景点槽位，或要复用这套流程时使用。
---

# 景见三维：如实记录

项目目录：`sites/jingjian-studio-redesign`。本地预览是静态构建加本机服务，不是云端已发布能力。

这里有两套互不替代的三维。不要把其中一套的产物当成另一套已经完成。

| | 单景点 3D 世界 | 微缩大地图 |
| --- | --- | --- |
| 游客看到的 | `#pilot`「走进三维实景」 | `#map`「湖山微缩游」（西湖才有；`?view=scroll` 仍是 2D 绘卷） |
| 做成什么 | 一张或多张照片交给 World Labs Marble，下载高斯溅射 `.spz` | 浏览器里用 Three.js 画的地形、堤、树、建筑 |
| 新景点会不会自动有 | 有照片槽位。点「生成」并成功后，才有一个世界文件槽位 | 不会。代码里没有 `SPOT_GEO` 就没有正式点位；工作室里「添加景点」只加 2D 图钉 |

大地图的逐步做法、坐标、手改过的地方见 [miniature-map.md](miniature-map.md)。

## 单景点 3D 世界

### 实际链路

1. 工作室景点的「照片」页放图片。六个视角槽位是 `front` `left` `rear` `back` `top` `inside`，外加不限数量的 `more-…`。
2. 送去生成的只有 `front` `rear` `back` `left`（`scenic-core.js` 的 `WORLD_ANGLES`）。俯视和近景不参与，因为生成接口只按方位角摆照片。
3. `worldInputs`：实拍、景区上传，以及 `kind==='ai-demo'` 且 `accepted===true` 的补图。未审核的 AI 补图不会送出。
4. 工作室「3D」页选模型后 `POST /api/worlds`。本机 `server.mjs` 才有这个接口。静态站点没有，界面会提示需要本机服务。
5. 服务要求 `WORLDLABS_API_KEY`。密钥只留在本机环境，不进前端、不进 Git、不进新 Site。没有密钥时接口返回 503，不扣费。
6. 模型只有两个：`marble-1.0-draft`（界面约 230–250 credits）、`marble-1.1`（约 1,580–1,600 credits）。一次 1–4 张、方位不能重复。
7. 方位写死：正面 0°、右侧 90°、背面 180°、左侧 270°。提示词要求保留照片里的建筑、材质、植被和日光，不要人和额外建筑。见 `server.mjs` 的 `text_prompt`。
8. 同一 `requestId` 重复提交会返回已有任务，避免点两次扣两次。上传阶段失败会删掉任务（上传不计费）。提交超时或 5xx 标成 `uncertain`，这时可能已经建了计费任务，先到 World Labs 核对，不要立刻重提。
9. 前端每 4 秒 `GET /api/worlds/<requestId>`。完成后服务下载 SPZ（优先 `500k`，否则 `full_res`，再否则 `100k`）。

### 成功后的文件槽位

目录在数据根的 `worlds/<worldId>/`（默认随本机服务的 data 目录，测试里是 `data/worlds`）：

- `world.spz`：场景本体
- `receipt.json`：模型、输入方位、`metric_scale_factor`、`ground_plane_offset`、起点 `view.home` / `view.target`、花费、文件 sha256

游客和预览通过本机服务读：

- `/generated/<worldId>/world.spz`
- `/generated/<worldId>/receipt.json`

公开静态构建不包含这两个文件，也没有 `/generated`。

草稿上的槽位是 `spot.world`（`applyGeneratedWorld`）：

```text
kind: 'generated'
model, worldId, spz, receipt, credits, inputs, createdAt
```

`worldAsset` 只认 `spz` 匹配 `/generated/<id>/world.spz` 的生成结果。别的 URL 会被忽略。

发布是整份草稿的拷贝（`publishScenic`）。`spot.world` 跟着发布快照走，但文件仍在本机 `worlds/`，不在 `dist/`。

照片换了之后，`worldStale` 用「方位=图片 url」对比。旧世界还在，工作室只提示可以重新生成。重新生成会再扣 credits。

### 花港是特例，不是新景点的空槽

只有景点 id 为花港、且正面仍是内置实拍 `/assets/real/huagang.jpg` 时，才回退到打包文件：

- 单图：`public/assets/world/huagang-500k.spz` 与 `huagang-generation.json`
- 六图试验：`huagang-multi-500k.spz` 与 `huagang-multi-generation.json`

六图试验是另一次生成（1 张实拍 + 5 张已审核 AI 补图），提示词和输入都不同，不是对照实验。AI 补出的背面和屋顶不代表实地。换掉或删掉花港正面实拍后，这个回退断开，不会自动套到别的景点。

### 播放

`pilot-world.js` 的 `mountPilotScene` 拉 receipt，用 `ground_plane_offset` 当眼高，`view.home` / `view.target` 当起点。`viewer.js` 只做范围受限的行走（WASD、拖动环顾）。范围来自 `spot.roam`，缺省是 `DEFAULT_ROAM`（前 2.5 m、后 0.6 m、左右 1.2 m、上 0.4 m、下 0.5 m），工作室滑块可改，发布后游客端用同一份。

单景点世界里的路标方向 = 大地图路网方位 − 该景点的 `heading`。`heading` 是起始视线的罗盘角（0 为正北，顺时针）。花港初始值 20 是看照片后的手估，不是测量值。工作室「制作助手 → 地图校准」可以改，并可用 `#pilot?...&heading=` 预览，采用后才写入草稿。

## 新增一个景点时，实际有什么槽

工作室「添加景点」或新建景区，只在浏览器草稿里加一条景点（IndexedDB）：名称、介绍、2D 图钉 `x,y`、照片、讲解、`world`。这不会生成任何三维文件。

| 想要的结果 | 现成槽位 | 没有槽位、必须改代码或重新生成 |
| --- | --- | --- |
| 2D 绘卷上一个点 | 有。`x,y` 是图片宽高的比例 | 换地图后点位不会自动对齐 |
| 大地图上一个标签 | 西湖大地图对没有 `SPOT_GEO` 的景点，用 `x,y` 线性塞进固定矩形（`map3d/index.js` 的 `posOf`），路线改走最近路网节点 | 这不是地理定位。正式点位要写进 `SPOT_GEO` |
| 大地图上的亭、塔、桥 | 没有通用槽 | `scene.js` 的 `landmarks()` 里按景点 id `tag()`。不写就只有标签，没有模型 |
| 可走进的 3D 世界 | 照片槽 + 生成成功后的 `worlds/<id>/` | 不点生成就没有。花港打包文件不会复制给新 id |
| 另一座景区的整张大地图 | `geo-registry.js` 目前只有 `westlake` | 没有登记的景区只有 2D。做法见 miniature-map.md |

质检（`runQA`）会警告：景点不在 3D 底图里。那只是提示，不会替你补几何。

## 不要当成已经做好的事

- 不要把规划中的云端同步、独立 Agent 服务、外部行程平台接入写成已完成。
- 不要在界面、日志或文档示例里写出密钥，也不要把 `.env` 复制进新站点。
- 生成进度必须对应真实任务（上传、operation、下载）。没有 `world.spz` 和 receipt 就不算生成完成。
- 未拍到的区域是模型推测。AI 补图即使已审核，也不等于实地。
