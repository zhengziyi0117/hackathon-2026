# 西湖微缩大地图：这次实际怎么做的

> 这是 `95eed47` 基线的历史制作记录。当前分支已拆成 JSON 数据包，文件槽位与命令以[地图数据包与 Agent 工作流](../../../docs/地图数据包与Agent工作流.md)为准。不要再照下文向 `westlake-geo.js` 或 `scene.js` 写景点坐标。

这是 `sites/jingjian-studio-redesign` 里西湖大地图的记录，不是自动管线。换一座景区要重做几何和手工布景；运行时没有「生成大地图」按钮。

预览：`http://127.0.0.1:4175/#map?s=westlake`（`npm start` 或先 `npm run build` 再看 `dist/`）。只对景区 id `westlake` 且 URL 不是 `view=scroll` 时加载（`src/app.js`）。

## 坐标

`scripts/westlake-osm.py` 与 `src/westlake-geo.js`：

- 原点经纬 `(120.1428, 30.2459)`，大约在湖心。
- 1 单位 = 100 米。经度每度 962 单位，纬度每度 1110 单位。`+x` 东，`+z` 南。
- 范围 `minX -24, maxX 22, minZ -24, maxZ 24`。
- `fromLonLat` / `toLonLat` 用的就是这组数。换地点要改原点和这两个比例，不能沿用西湖的数。

## 1. 从 OpenStreetMap 抽出湖岸

`python3 scripts/westlake-osm.py`

- 没有参数时，用 Overpass 把结果下到 `artifacts/osm-westlake-src.json`。请求必须带 User-Agent，否则会 406。已有文件则不重新下载。
- 查询框大约 `30.225–30.268 N, 120.125–120.165 E`。取名为「西湖」的水域 relation，加上命名水体、苏堤、白堤，以及写死的一批景点名和桥名。
- 外环、内环（岛）按 even-odd 合成。陆上面积 ≥ 0.25 单位² 的园池也算水。
- 闭合环先在离起点最远的点拆开，再做 Douglas–Peucker（容差 0.05）。不拆的话简化会把整环收成一个点。
- 苏堤、白堤在桥处被 OSM 拆成很多 way。脚本把堤和同名桥的点收齐，苏堤按 z、白堤按 x 排序，再简化（容差 0.03）。
- 写出 `src/westlake-osm.js`。文件头保留 `© OpenStreetMap contributors, ODbL 1.0`。页面角落有链到 https://www.openstreetmap.org/copyright 的署名（`map3d/index.js` 的 `.m3-osm`）。换数据源时署名要跟着换，不能留着 OSM 署名却不用 OSM。

这次产物大约 49 个水环。POI 坐标以生成文件为准，不要从旧对话或旧 GitHub 副本抄。

## 2. 把抽取出的线变成可走的地

都在 `src/westlake-geo.js`，第一处使用时才建网格。

- 10 米一格（0.1 单位）。扫描线栅格化水域，再用 Felzenszwalb–Huttenlocher 距离变换得到有符号距离：陆地为正，水为负。
- 双线性采样，再加很小的噪声（幅度约 0.03）。
- 堤是后来并上去的：距折线小于半个路宽则视为陆地。苏堤宽 0.36，白堤 0.32。西泠桥、金沙堤、圣塘桥、九曲桥是更窄的手工折线，OSM 里形状不完整的用了近似。
- 桥洞强制为水（约 -0.08），这样路看起来是断开的，水从下面过。桥面高度是拱：`.08 + BRIDGE.height * (1-u²)`，断桥再乘 1.4。`BRIDGE` 为长 0.8、高 0.14、洞宽 0.26。
- `walkable`：在范围内，且（陆地距离 > 0.04 或踩在桥面上），且地形高度 < 3.8。小人用 `groundHeight`，所以上桥会沿拱走。

山和城区不是 OSM：

- `hillHeight` 是手放的高斯包，靠近宝石山、保俶塔、孤山、夕照山、南屏山和西、南边。高度是为了好看，不是测高。
- `cityAmount` 只在东边（大约 x > 14.6）和东北角升高。那里画城，不画成山。

## 3. 路网

`node scripts/westlake-paths.mjs | python3 scripts/splice-paths.py`

- 读的是已经写好的 `westlake-geo.js`（所以要先有堤和 `landField`）。
- 航点吸到岸边一带（陆地距离大约 0.12–0.7，失败再放宽到 9），两点之间若踩到水就取中点再吸，直到每步 0.03 都可走。
- 堤上的节点用堤顶点，不抄近路。
- 命名停靠点是手写的。花港停靠点从 OSM 观景点挪进园内 `[-6.0, 13.25]`，否则亭子会压在堤头。雷峰塔停靠点放在塔和南岸之间约 42% 处，避免小人站进塔里。
- 船只有三条：花港、湖滨、平湖的码头到小瀛洲码头。`shortestPath` 把船边长度乘 0.8，所以略偏好坐船。
- 脚本把 `export const NODES=` 到 `export const EDGES=` 整段替换掉。不要手改这一段又忘了它会被覆盖。
- 这次结果：68 个节点、71 条边。stderr 里 `not walkable` 应为空。

`SPOT_GEO` 不由脚本生成。每个要出现在大地图上的景点手工绑一个节点、一个 `label` 坐标、`scene` 文案、可选 `heading` 和 `season`。邻接、距离、步行或坐船都从这张表和路网算（`neighboursOf`）。

## 4. 画面

`src/map3d/scene.js` 读上面的数据，不读照片。

- 地形按 `landField` / `hillHeight` / `cityAmount` 着色。水面铺满整块范围。
- 树：随机林 + 苏堤白堤两侧「一柳一桃」（间距约 0.3，桥附近跳过）+ 小瀛洲、湖心亭、阮公墩补种。
- 城区：`city()` 在 `cityAmount > 0.6` 的陆地上撒白墙灰顶矮房和少量高楼，夜间窗户用发光条。不是真实街区。
- `landmarks()` 里六个景点各有一个模型，并用 `tag(景点id)` 挂上，卡片和印章才对得准。另外有湖心亭、保俶塔，以及每座桥一座拱；断桥更大。亭、塔的位置用 `siteNear` 躲开路，避免模型吞掉小人。
- 荷花只铺在玉带桥附近，不是全湖。

`src/map3d/index.js`：

- 景点标签位置用 `SPOT_GEO.label`。没有这项时用 2D 图钉比例硬映射，不可当作地理坐标。
- 地名（苏堤、白堤、孤山等）是 `PLACE_LABELS` 里的手写列表。
- 相机会话键 `jj-map3d-osm`。改过地形后如果小人还在旧坐标，换这个键，或清 `sessionStorage`。
- 行走：相对相机的右向量，`d` 加、`a` 减。曾把左右做反，改的是这一处。

样式在 `src/map3d/map3d.css`，并且在入口被静态 import。只从异步 chunk 引 CSS 不会进页面。

## 5. 和 2D 绘卷的关系

2D 图是后画的，用来跟大地图互相对照，不是大地图的输入。

- 现用文件：`public/assets/scenic/westlake-map.jpg`（AI 绘卷）。旧图 `garden-map.png` 是一张通用园林，湖形不对，已不再作为西湖默认图。
- 点位在 `src/scenic-places.js` 的 `x,y`（相对图片宽高）。这组数是按绘卷构图估的，不是由经纬度投影得到的。
- 已有浏览器草稿如果还指着 `garden-map.png` 且不是用户上传的图，`toLakeMap` 会换成新图并把内置景点坐标改成种子值。用户自己上传的地图不动。

## 换一座景区时按这个顺序

1. 新的 OSM（或别的）抽取脚本，新的原点、比例、范围、署名。不要复用 `westlake-osm.js`。
2. 新的 geo 模块：水、堤或路、`landField`、`walkable`、`NODES` / `EDGES`、`SPOT_GEO`。
3. 在 `src/geo-registry.js` 用景区 id 登记。不登记则游客只有 2D，制作助手会写「还没有 3D 地图底图」。
4. 场景文件里为每个 `SPOT_GEO` id 放模型；不放就只有标签。
5. 用调试页或浏览器看：路没有跨进水、节点都 `walkable`、桥洞是水、小人左右和相机一致、署名在角上。
6. 2D 绘卷如果要跟大地图一致，先用俯视渲染当构图，再画，再改 `x,y`。不要假设旧图钉还对准。

`src/map3d/index.js` 和 `scene.js` 目前直接 import `westlake-geo.js`。新景区不能只改 registry 就出现第二张大地图，入口还是西湖专用的。
